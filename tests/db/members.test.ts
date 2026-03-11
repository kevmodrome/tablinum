import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import { RelayError } from "../../src/errors.ts";
import { fetchAuthorProfile } from "../../src/db/members.ts";
import type { RelayHandle } from "../../src/sync/relay.ts";

function makeRelayHandle(responses: Record<string, string | null | Error>): RelayHandle {
  return {
    fetchByFilter: (_filter, url) => {
      const response = responses[url];
      if (response instanceof Error) {
        return Effect.fail(
          new RelayError({
            message: response.message,
            url,
            cause: response,
          }),
        );
      }
      if (response === null) {
        return Effect.succeed([] as NostrEvent[]);
      }
      return Effect.succeed([{ content: response } as NostrEvent]);
    },
  } as RelayHandle;
}

describe("members", () => {
  it("keeps only supported profile fields", async () => {
    const relay = makeRelayHandle({
      "wss://relay.example.com": JSON.stringify({
        name: "Alice",
        picture: "https://example.com/alice.png",
        about: "Hello",
        extra: "ignored",
      }),
    });

    const profile = await Effect.runPromise(
      fetchAuthorProfile(relay, ["wss://relay.example.com"], "pubkey"),
    );

    expect(Option.isSome(profile)).toBe(true);
    expect(Option.getOrThrow(profile)).toEqual({
      name: "Alice",
      picture: "https://example.com/alice.png",
      about: "Hello",
    });
  });

  it("skips failed relays and uses the next valid profile", async () => {
    const relay = makeRelayHandle({
      "wss://relay-1.example.com": new Error("boom"),
      "wss://relay-2.example.com": JSON.stringify({ name: "Alice" }),
    });

    const profile = await Effect.runPromise(
      fetchAuthorProfile(
        relay,
        ["wss://relay-1.example.com", "wss://relay-2.example.com"],
        "pubkey",
      ),
    );

    expect(Option.isSome(profile)).toBe(true);
    expect(Option.getOrThrow(profile)).toEqual({ name: "Alice" });
  });

  it("returns None for invalid profile payloads", async () => {
    const relay = makeRelayHandle({
      "wss://relay.example.com": JSON.stringify({ name: 123 }),
    });

    const profile = await Effect.runPromise(
      fetchAuthorProfile(relay, ["wss://relay.example.com"], "pubkey"),
    );

    expect(Option.isNone(profile)).toBe(true);
  });
});
