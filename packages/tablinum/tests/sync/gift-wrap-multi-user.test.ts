import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { createGiftWrapHandle } from "../../src/sync/gift-wrap.ts";

describe("gift wrap multi-user", () => {
  it.effect("user wraps with own key, group decrypts with group key", () =>
    Effect.gen(function* () {
      // User A's identity
      const userSk = generateSecretKey();

      // Shared group keypair
      const groupSk = generateSecretKey();
      const groupPk = getPublicKey(groupSk);

      // User A wraps to group pubkey, decryption uses group private key
      const handle = createGiftWrapHandle(userSk, groupPk, groupSk);

      const giftWrap = yield* handle.wrap({
        kind: 1,
        content: JSON.stringify({ title: "Shared todo" }),
        tags: [["d", "todos:shared-1"]],
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(giftWrap.kind).toBe(1059);

      // Decrypt with group key
      const rumor = yield* handle.unwrap(giftWrap);
      expect(rumor.kind).toBe(1);
      expect(rumor.content).toBe(JSON.stringify({ title: "Shared todo" }));

      // Rumor should be signed by user A, not the group
      expect(rumor.pubkey).toBe(getPublicKey(userSk));
      expect(rumor.pubkey).not.toBe(groupPk);
    }),
  );

  it.effect("two users can read each other's wraps via shared group key", () =>
    Effect.gen(function* () {
      // Shared group keypair
      const groupSk = generateSecretKey();
      const groupPk = getPublicKey(groupSk);

      // User A
      const userASk = generateSecretKey();
      const handleA = createGiftWrapHandle(userASk, groupPk, groupSk);

      // User B
      const userBSk = generateSecretKey();
      const handleB = createGiftWrapHandle(userBSk, groupPk, groupSk);

      // A writes
      const gwFromA = yield* handleA.wrap({
        kind: 1,
        content: "from A",
        tags: [["d", "test:1"]],
        created_at: Math.floor(Date.now() / 1000),
      });

      // B writes
      const gwFromB = yield* handleB.wrap({
        kind: 1,
        content: "from B",
        tags: [["d", "test:2"]],
        created_at: Math.floor(Date.now() / 1000),
      });

      // B can read A's wrap
      const rumorFromA = yield* handleB.unwrap(gwFromA);
      expect(rumorFromA.content).toBe("from A");
      expect(rumorFromA.pubkey).toBe(getPublicKey(userASk));

      // A can read B's wrap
      const rumorFromB = yield* handleA.unwrap(gwFromB);
      expect(rumorFromB.content).toBe("from B");
      expect(rumorFromB.pubkey).toBe(getPublicKey(userBSk));
    }),
  );

  it.effect("single-user mode still works (all keys from same source)", () =>
    Effect.gen(function* () {
      const sk = generateSecretKey();
      const pk = getPublicKey(sk);
      const handle = createGiftWrapHandle(sk, pk, sk);

      const gw = yield* handle.wrap({
        kind: 1,
        content: "solo",
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      });

      const rumor = yield* handle.unwrap(gw);
      expect(rumor.content).toBe("solo");
      expect(rumor.pubkey).toBe(pk);
    }),
  );

  it.effect("cannot decrypt with wrong key", () =>
    Effect.gen(function* () {
      const groupSk = generateSecretKey();
      const groupPk = getPublicKey(groupSk);
      const userSk = generateSecretKey();

      const handle = createGiftWrapHandle(userSk, groupPk, groupSk);
      const gw = yield* handle.wrap({
        kind: 1,
        content: "secret",
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      });

      // Try to decrypt with a different key
      const wrongSk = generateSecretKey();
      const wrongHandle = createGiftWrapHandle(wrongSk, groupPk, wrongSk);
      const result = yield* Effect.result(wrongHandle.unwrap(gw));
      expect(result._tag).toBe("Failure");
    }),
  );
});
