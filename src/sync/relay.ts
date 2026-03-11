import { Effect, Schema, ScopedCache, Scope } from "effect";
import { Relay } from "nostr-tools/relay";
import type { NostrEvent } from "nostr-tools/pure";
import type { Filter } from "nostr-tools/filter";
import { RelayError } from "../errors.ts";

export interface RelayHandle {
  readonly publish: (event: NostrEvent, urls: readonly string[]) => Effect.Effect<void, RelayError>;
  readonly fetchEvents: (
    ids: readonly string[],
    url: string,
  ) => Effect.Effect<NostrEvent[], RelayError>;
  readonly fetchByFilter: (filter: Filter, url: string) => Effect.Effect<NostrEvent[], RelayError>;
  readonly subscribe: (
    filter: Filter,
    url: string,
    onEvent: (event: NostrEvent) => void,
  ) => Effect.Effect<void, RelayError>;
  readonly sendNegMsg: (
    url: string,
    subId: string,
    filter: Filter,
    msgHex: string,
  ) => Effect.Effect<{ msgHex: string | null; haveIds: string[]; needIds: string[] }, RelayError>;
  readonly closeAll: () => Effect.Effect<void>;
}

export type NegFrame = readonly ["NEG-MSG", string, string] | readonly ["NEG-ERR", string, string];

const NegMessageFrameSchema = Schema.Tuple([
  Schema.Literal("NEG-MSG"),
  Schema.String,
  Schema.String,
]);

const NegErrorFrameSchema = Schema.Tuple([Schema.Literal("NEG-ERR"), Schema.String, Schema.String]);

const decodeNegFrame = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Union([NegMessageFrameSchema, NegErrorFrameSchema])),
);

export function parseNegMessageFrame(data: string): NegFrame | null {
  return Effect.runSync(decodeNegFrame(data).pipe(Effect.orElseSucceed(() => null)));
}

export function createRelayHandle(): Effect.Effect<RelayHandle, never, Scope.Scope> {
  return Effect.gen(function* () {
    const connections = yield* ScopedCache.make<string, Relay, RelayError>({
      capacity: 64,
      lookup: (url) =>
        Effect.acquireRelease(
          Effect.tryPromise({
            try: () => Relay.connect(url),
            catch: (e) =>
              new RelayError({
                message: `Connect to ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
                url,
                cause: e,
              }),
          }),
          (relay) =>
            Effect.sync(() => {
              relay.close();
            }),
        ),
    });

    const getRelay = (url: string): Effect.Effect<Relay, RelayError> =>
      ScopedCache.get(connections, url).pipe(
        Effect.flatMap((relay) =>
          (relay as { connected?: boolean }).connected === false
            ? ScopedCache.invalidate(connections, url).pipe(
                Effect.andThen(ScopedCache.get(connections, url)),
              )
            : Effect.succeed(relay),
        ),
      );

    const withRelay = <A>(
      url: string,
      run: (relay: Relay) => Effect.Effect<A, RelayError>,
    ): Effect.Effect<A, RelayError> =>
      getRelay(url).pipe(
        Effect.flatMap((relay) => run(relay)),
        Effect.tapError(() => ScopedCache.invalidate(connections, url)),
      );

    const collectEvents = (
      url: string,
      filters: ReadonlyArray<Filter>,
    ): Effect.Effect<NostrEvent[], RelayError> =>
      withRelay(url, (relay) =>
        Effect.tryPromise({
          try: () =>
            new Promise<NostrEvent[]>((resolve) => {
              const events: NostrEvent[] = [];
              const timer = setTimeout(() => {
                sub.close();
                resolve(events);
              }, 10000);
              const sub = relay.subscribe([...filters], {
                onevent(evt: NostrEvent) {
                  events.push(evt);
                },
                oneose() {
                  clearTimeout(timer);
                  sub.close();
                  resolve(events);
                },
              });
            }),
          catch: (e) =>
            new RelayError({
              message: `Fetch from ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
              url,
              cause: e,
            }),
        }),
      );

    return {
      publish: (event, urls) =>
        Effect.gen(function* () {
          const results = yield* Effect.forEach(
            urls,
            (url) =>
              Effect.result(
                withRelay(url, (relay) =>
                  Effect.tryPromise({
                    try: () => relay.publish(event),
                    catch: (e) =>
                      new RelayError({
                        message: `Publish to ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
                        url,
                        cause: e,
                      }),
                  }),
                ),
              ),
            { concurrency: "unbounded" },
          );
          const failures = results.filter((r) => r._tag === "Failure");
          if (failures.length === urls.length && urls.length > 0) {
            return yield* new RelayError({
              message: `Publish failed on all ${urls.length} relays`,
            });
          }
        }),

      fetchEvents: (ids, url) =>
        Effect.gen(function* () {
          if (ids.length === 0) return [] as NostrEvent[];
          return yield* collectEvents(url, [{ ids: ids as string[] }]);
        }),

      fetchByFilter: (filter, url) => collectEvents(url, [filter]),

      subscribe: (filter, url, onEvent) =>
        withRelay(url, (relay) =>
          Effect.try({
            try: () => {
              relay.subscribe([filter], {
                onevent(evt: NostrEvent) {
                  onEvent(evt);
                },
                oneose() {
                  // Initial fetch complete, keep subscription open for real-time
                },
              });
            },
            catch: (e) =>
              new RelayError({
                message: `Subscribe to ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
                url,
                cause: e,
              }),
          }),
        ),

      sendNegMsg: (url, subId, filter, msgHex) =>
        withRelay(url, (relay) =>
          Effect.tryPromise({
            try: () =>
              new Promise<{
                msgHex: string | null;
                haveIds: string[];
                needIds: string[];
              }>((resolve, reject) => {
                const sub = relay.subscribe([filter], {
                  onevent() {},
                  oneose() {},
                });

                let timer: ReturnType<typeof setTimeout> | undefined;

                // Use raw WebSocket for NIP-77
                const ws = (relay as any)._ws || (relay as any).ws;
                if (!ws) {
                  sub.close();
                  reject(new Error("Cannot access relay WebSocket"));
                  return;
                }

                const cleanup = () => {
                  if (timer !== undefined) {
                    clearTimeout(timer);
                  }
                  sub.close();
                  ws.removeEventListener("message", handler);
                };

                timer = setTimeout(() => {
                  cleanup();
                  reject(new Error("NIP-77 negotiation timeout"));
                }, 30000);

                const handler = (msg: MessageEvent) => {
                  if (typeof msg.data !== "string") return;
                  const frame = parseNegMessageFrame(msg.data);
                  if (!frame || frame[1] !== subId) return;

                  cleanup();
                  if (frame[0] === "NEG-MSG") {
                    resolve({
                      msgHex: frame[2],
                      haveIds: [],
                      needIds: [],
                    });
                    return;
                  }
                  reject(new Error(`NEG-ERR: ${frame[2]}`));
                };

                ws.addEventListener("message", handler);
                ws.send(JSON.stringify(["NEG-OPEN", subId, filter, msgHex]));
              }),
            catch: (e) =>
              new RelayError({
                message: `NIP-77 negotiation with ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
                url,
                cause: e,
              }),
          }),
        ),

      closeAll: () => ScopedCache.invalidateAll(connections),
    };
  });
}
