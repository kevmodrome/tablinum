import { Effect, Option } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import { Relay } from "nostr-tools/relay";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRelayHandle, parseNegMessageFrame } from "../../src/sync/relay.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("relay neg frame parser", () => {
  it("parses NEG-MSG frames", () => {
    const result = parseNegMessageFrame(JSON.stringify(["NEG-MSG", "sub-1", "abcd"]));
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result)).toEqual(["NEG-MSG", "sub-1", "abcd"]);
  });

  it("parses NEG-ERR frames", () => {
    const result = parseNegMessageFrame(JSON.stringify(["NEG-ERR", "sub-1", "failure"]));
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result)).toEqual(["NEG-ERR", "sub-1", "failure"]);
  });

  it("rejects invalid NEG frames", () => {
    expect(Option.isNone(parseNegMessageFrame("not json"))).toBe(true);
    expect(Option.isNone(parseNegMessageFrame(JSON.stringify(["EVENT", "sub-1", "abcd"])))).toBe(
      true,
    );
    expect(Option.isNone(parseNegMessageFrame(JSON.stringify(["NEG-MSG", "sub-1"])))).toBe(true);
  });

  it("reconnects when a cached relay has already disconnected", async () => {
    const firstClose = vi.fn();
    const secondPublish = vi.fn().mockResolvedValue(undefined);
    const secondClose = vi.fn();
    const connect = vi
      .spyOn(Relay, "connect")
      .mockResolvedValueOnce({
        connected: false,
        close: firstClose,
      } as unknown as Relay)
      .mockResolvedValueOnce({
        connected: true,
        publish: secondPublish,
        close: secondClose,
      } as unknown as Relay);

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const relay = yield* createRelayHandle();
          yield* relay.publish(
            {
              id: "event-1",
              pubkey: "author",
              created_at: 0,
              kind: 1,
              tags: [],
              content: "",
              sig: "sig",
            } as NostrEvent,
            ["wss://relay.example.com"],
          );
        }),
      ),
    );

    expect(connect).toHaveBeenCalledTimes(2);
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondPublish).toHaveBeenCalledTimes(1);
    expect(secondClose).toHaveBeenCalledTimes(1);
  });

  it("closes subscriptions when the relay scope closes", async () => {
    const closeSubscription = vi.fn();
    const closeRelay = vi.fn();
    vi.spyOn(Relay, "connect").mockResolvedValue({
      connected: true,
      subscribe: vi.fn(() => ({
        close: closeSubscription,
      })),
      close: closeRelay,
    } as unknown as Relay);

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const relay = yield* createRelayHandle();
          yield* relay.subscribe({ kinds: [1] }, "wss://relay.example.com", () => {});
        }),
      ),
    );

    expect(closeSubscription).toHaveBeenCalledTimes(1);
    expect(closeRelay).toHaveBeenCalledTimes(1);
  });
});
