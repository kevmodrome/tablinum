import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { createEpochGiftWrapHandle } from "../../src/sync/gift-wrap.ts";
import { createEpochKey, createEpochStore, addEpoch, bytesToHex } from "../../src/db/epoch.ts";
import { EpochId } from "../../src/brands.ts";

describe("gift wrap multi-epoch", () => {
  it.effect("wraps with current epoch and unwraps by #p tag lookup", () =>
    Effect.gen(function* () {
      const userSk = generateSecretKey();
      const groupKeyHex = bytesToHex(generateSecretKey());
      const epoch0 = createEpochKey(EpochId("e0"), groupKeyHex, Date.now(), getPublicKey(userSk));
      const store = createEpochStore(epoch0);

      const handle = createEpochGiftWrapHandle(userSk, store);

      const gw = yield* handle.wrap({
        kind: 1,
        content: JSON.stringify({ title: "Test" }),
        tags: [["d", "todos:1"]],
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(gw.kind).toBe(1059);
      // Gift wrap should have #p tag pointing to epoch public key
      const pTag = gw.tags.find((t: string[]) => t[0] === "p");
      expect(pTag).toBeDefined();
      expect(pTag![1]).toBe(epoch0.publicKey);

      const rumor = yield* handle.unwrap(gw);
      expect(rumor.content).toBe(JSON.stringify({ title: "Test" }));
    }),
  );

  it.effect("after rotation, writes use new epoch and reads work for both", () =>
    Effect.gen(function* () {
      const userSk = generateSecretKey();
      const k0Hex = bytesToHex(generateSecretKey());
      const k1Hex = bytesToHex(generateSecretKey());

      const epoch0 = createEpochKey(EpochId("e0"), k0Hex, 1000, getPublicKey(userSk));
      const epoch1 = createEpochKey(
        EpochId("e1"),
        k1Hex,
        2000,
        getPublicKey(userSk),
        EpochId("e0"),
      );

      const store = createEpochStore(epoch0);
      const handle = createEpochGiftWrapHandle(userSk, store);

      // Write with epoch 0
      const gwOld = yield* handle.wrap({
        kind: 1,
        content: "old data",
        tags: [["d", "test:1"]],
        created_at: 1000,
      });

      // Rotate: add epoch 1
      addEpoch(store, epoch1);
      store.currentEpochId = EpochId("e1");

      // Write with epoch 1 (same handle, store mutated)
      const gwNew = yield* handle.wrap({
        kind: 1,
        content: "new data",
        tags: [["d", "test:2"]],
        created_at: 2000,
      });

      // New writes use epoch 1's public key
      const pTagNew = gwNew.tags.find((t: string[]) => t[0] === "p");
      expect(pTagNew![1]).toBe(epoch1.publicKey);

      // Old writes still had epoch 0's public key
      const pTagOld = gwOld.tags.find((t: string[]) => t[0] === "p");
      expect(pTagOld![1]).toBe(epoch0.publicKey);

      // Can decrypt both epochs
      const rumorOld = yield* handle.unwrap(gwOld);
      expect(rumorOld.content).toBe("old data");

      const rumorNew = yield* handle.unwrap(gwNew);
      expect(rumorNew.content).toBe("new data");
    }),
  );

  it.effect("fails to unwrap with unknown epoch key", () =>
    Effect.gen(function* () {
      const userSk = generateSecretKey();
      const k0Hex = bytesToHex(generateSecretKey());
      const k1Hex = bytesToHex(generateSecretKey());

      const epoch0 = createEpochKey(EpochId("e0"), k0Hex, 1000, getPublicKey(userSk));
      const epoch1 = createEpochKey(EpochId("e1"), k1Hex, 2000, getPublicKey(userSk));

      // Store with only epoch 1 (missing epoch 0)
      const store = createEpochStore(epoch1);
      const handle = createEpochGiftWrapHandle(userSk, store);

      // Create a gift wrap with epoch 0
      const storeWithE0 = createEpochStore(epoch0);
      const handleE0 = createEpochGiftWrapHandle(userSk, storeWithE0);
      const gw = yield* handleE0.wrap({
        kind: 1,
        content: "secret",
        tags: [],
        created_at: 1000,
      });

      // Should fail: store doesn't have epoch 0's key
      const result = yield* Effect.result(handle.unwrap(gw));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("two users with same epoch store can read each other", () =>
    Effect.gen(function* () {
      const groupKeyHex = bytesToHex(generateSecretKey());
      const epoch0 = createEpochKey(EpochId("e0"), groupKeyHex, Date.now(), "creator");

      // User A
      const userASk = generateSecretKey();
      const storeA = createEpochStore(epoch0);
      const handleA = createEpochGiftWrapHandle(userASk, storeA);

      // User B (same epoch key, different personal key)
      const userBSk = generateSecretKey();
      const storeB = createEpochStore(epoch0);
      const handleB = createEpochGiftWrapHandle(userBSk, storeB);

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

      // A can read B's wrap
      const rumorFromB = yield* handleA.unwrap(gwFromB);
      expect(rumorFromB.content).toBe("from B");
    }),
  );
});
