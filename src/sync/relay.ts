import { Effect } from "effect";
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

export function createRelayHandle(): RelayHandle {
  const connections = new Map<string, Relay>();

  const getRelay = (url: string): Effect.Effect<Relay, RelayError> =>
    Effect.tryPromise({
      try: async () => {
        const existing = connections.get(url);
        if (existing && (existing as any).connected !== false) {
          return existing;
        }
        // Clean up stale entry
        connections.delete(url);
        const relay = await Relay.connect(url);
        connections.set(url, relay);
        return relay;
      },
      catch: (e) =>
        new RelayError({
          message: `Connect to ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
          url,
          cause: e,
        }),
    });

  return {
    publish: (event, urls) =>
      Effect.gen(function* () {
        const errors: Array<{ url: string; error: unknown }> = [];
        for (const url of urls) {
          const result = yield* Effect.result(
            Effect.gen(function* () {
              const relay = yield* getRelay(url);
              yield* Effect.tryPromise({
                try: () => relay.publish(event),
                catch: (e) => {
                  // Connection may be stale, remove so next attempt reconnects
                  connections.delete(url);
                  return new RelayError({
                    message: `Publish to ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
                    url,
                    cause: e,
                  });
                },
              });
            }),
          );
          if (result._tag === "Failure") {
            errors.push({ url, error: result });
          }
        }
        if (errors.length === urls.length && urls.length > 0) {
          return yield* new RelayError({
            message: `Publish failed on all ${urls.length} relays`,
          });
        }
      }),

    fetchEvents: (ids, url) =>
      Effect.gen(function* () {
        if (ids.length === 0) return [] as NostrEvent[];
        const relay = yield* getRelay(url);
        return yield* Effect.tryPromise({
          try: () =>
            new Promise<NostrEvent[]>((resolve) => {
              const events: NostrEvent[] = [];
              const timer = setTimeout(() => {
                sub.close();
                resolve(events);
              }, 10000);
              const sub = relay.subscribe([{ ids: ids as string[] }], {
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
          catch: (e) => {
            connections.delete(url);
            return new RelayError({
              message: `Fetch from ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
              url,
              cause: e,
            });
          },
        });
      }),

    fetchByFilter: (filter, url) =>
      Effect.gen(function* () {
        const relay = yield* getRelay(url);
        return yield* Effect.tryPromise({
          try: () =>
            new Promise<NostrEvent[]>((resolve) => {
              const events: NostrEvent[] = [];
              const timer = setTimeout(() => {
                sub.close();
                resolve(events);
              }, 10000);
              const sub = relay.subscribe([filter], {
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
          catch: (e) => {
            connections.delete(url);
            return new RelayError({
              message: `Fetch from ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
              url,
              cause: e,
            });
          },
        });
      }),

    subscribe: (filter, url, onEvent) =>
      Effect.gen(function* () {
        const relay = yield* getRelay(url);
        relay.subscribe([filter], {
          onevent(evt: NostrEvent) {
            onEvent(evt);
          },
          oneose() {
            // Initial fetch complete, keep subscription open for real-time
          },
        });
      }),

    sendNegMsg: (url, subId, filter, msgHex) =>
      Effect.gen(function* () {
        const relay = yield* getRelay(url);
        return yield* Effect.tryPromise({
          try: () =>
            new Promise<{
              msgHex: string | null;
              haveIds: string[];
              needIds: string[];
            }>((resolve, reject) => {
              const timer = setTimeout(() => {
                reject(new Error("NIP-77 negotiation timeout"));
              }, 30000);

              const sub = relay.subscribe([filter], {
                onevent() {},
                oneose() {},
              });

              // Use raw WebSocket for NIP-77
              const ws = (relay as any)._ws || (relay as any).ws;
              if (!ws) {
                clearTimeout(timer);
                sub.close();
                reject(new Error("Cannot access relay WebSocket"));
                return;
              }

              const handler = (msg: MessageEvent) => {
                try {
                  const data = JSON.parse(typeof msg.data === "string" ? msg.data : "");
                  if (!Array.isArray(data)) return;
                  if (data[0] === "NEG-MSG" && data[1] === subId) {
                    clearTimeout(timer);
                    sub.close();
                    resolve({
                      msgHex: data[2] as string,
                      haveIds: [],
                      needIds: [],
                    });
                    ws.removeEventListener("message", handler);
                  } else if (data[0] === "NEG-ERR" && data[1] === subId) {
                    clearTimeout(timer);
                    sub.close();
                    reject(new Error(`NEG-ERR: ${data[2]}`));
                    ws.removeEventListener("message", handler);
                  }
                } catch {
                  // ignore parse errors
                }
              };

              ws.addEventListener("message", handler);
              ws.send(JSON.stringify(["NEG-OPEN", subId, filter, msgHex]));
            }),
          catch: (e) => {
            connections.delete(url);
            return new RelayError({
              message: `NIP-77 negotiation with ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
              url,
              cause: e,
            });
          },
        });
      }),

    closeAll: () =>
      Effect.sync(() => {
        for (const [url, relay] of connections) {
          relay.close();
          connections.delete(url);
        }
      }),
  };
}
