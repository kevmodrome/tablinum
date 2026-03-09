import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { createGiftWrapHandle } from "../../src/sync/gift-wrap.ts";

describe("gift wrap", () => {
  it.effect("round-trips wrap and unwrap", () =>
    Effect.gen(function* () {
      const sk = generateSecretKey();
      const pk = getPublicKey(sk);
      const handle = createGiftWrapHandle(sk, pk);

      const giftWrap = yield* handle.wrap({
        kind: 1,
        content: JSON.stringify({ title: "Test", done: false }),
        tags: [["d", "todos:abc-123"]],
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(giftWrap.kind).toBe(1059);
      expect(giftWrap.id).toBeDefined();
      expect(giftWrap.sig).toBeDefined();

      const rumor = yield* handle.unwrap(giftWrap);
      expect(rumor.kind).toBe(1);
      expect(rumor.content).toBe(JSON.stringify({ title: "Test", done: false }));
      const dTag = rumor.tags.find((t: string[]) => t[0] === "d");
      expect(dTag).toBeDefined();
      expect(dTag![1]).toBe("todos:abc-123");
    }),
  );

  it.effect("gift wrap uses random key (different pubkey each time)", () =>
    Effect.gen(function* () {
      const sk = generateSecretKey();
      const pk = getPublicKey(sk);
      const handle = createGiftWrapHandle(sk, pk);

      const rumor = {
        kind: 1,
        content: "test",
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      };

      const gw1 = yield* handle.wrap(rumor);
      const gw2 = yield* handle.wrap(rumor);

      // Gift wraps should have different pubkeys (random disposable keys)
      expect(gw1.pubkey).not.toBe(gw2.pubkey);
      // And different from the author's pubkey
      expect(gw1.pubkey).not.toBe(pk);
    }),
  );
});
