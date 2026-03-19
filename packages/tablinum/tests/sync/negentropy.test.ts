import { describe, expect, it } from "vitest";
import { Effect } from "effect";
// @ts-expect-error -- vendored JS without types
import { Negentropy, NegentropyStorageVector } from "../../src/vendor/negentropy.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { IDBStorageHandle, StoredGiftWrap } from "../../src/storage/idb.ts";
import type { RelayHandle } from "../../src/sync/relay.ts";
import { reconcileWithRelay } from "../../src/sync/negentropy.ts";

// Nostr event IDs are 32-byte hex strings (64 chars)
function hexId(n: number): string {
  return n.toString(16).padStart(64, "0");
}

/**
 * Creates a server-side Negentropy instance that simulates a relay.
 * The relay "has" the given set of gift wrap IDs.
 */
function createServerNeg(ids: { id: string; createdAt: number }[]) {
  const sv = new NegentropyStorageVector();
  for (const { id, createdAt } of ids) {
    sv.insert(createdAt, hexToBytes(id));
  }
  sv.seal();
  return new Negentropy(sv, 0);
}

function createMockStorage(localGiftWraps: StoredGiftWrap[]): IDBStorageHandle {
  return {
    getAllGiftWraps: () => Effect.succeed(localGiftWraps),
  } as unknown as IDBStorageHandle;
}

/**
 * Creates a mock relay whose sendNegMsg runs the server-side Negentropy
 * protocol in-process, simulating the relay's NEG-MSG / NEG-MSG response.
 */
function createMockRelay(serverNeg: ReturnType<typeof createServerNeg>): RelayHandle {
  return {
    sendNegMsg: (_url: string, _subId: string, _filter: unknown, msgHex: string) =>
      Effect.tryPromise({
        try: async () => {
          const [nextMsg] = await serverNeg.reconcile(msgHex);
          return {
            msgHex: nextMsg as string | null,
            haveIds: [] as string[],
            needIds: [] as string[],
          };
        },
        catch: (e) => e,
      }),
  } as unknown as RelayHandle;
}

describe("reconcileWithRelay", () => {
  it("returns needIds for events the relay has but local storage does not", async () => {
    const remoteOnly = hexId(1);
    const shared = hexId(2);

    const storage = createMockStorage([
      { id: shared, createdAt: 200, event: {} as never },
    ]);

    const serverNeg = createServerNeg([
      { id: shared, createdAt: 200 },
      { id: remoteOnly, createdAt: 100 },
    ]);

    const relay = createMockRelay(serverNeg);

    const result = await Effect.runPromise(
      reconcileWithRelay(storage, relay, "wss://test.example.com", "pubkey123"),
    );

    // The result should be a proper object with arrays, not a Promise
    expect(result).toBeDefined();
    expect(Array.isArray(result.needIds)).toBe(true);
    expect(Array.isArray(result.haveIds)).toBe(true);

    // We should need the event that only the relay has
    expect(result.needIds).toContain(remoteOnly);
    expect(result.needIds).not.toContain(shared);
  });

  it("returns haveIds for events local storage has but the relay does not", async () => {
    const localOnly = hexId(3);
    const shared = hexId(4);

    const storage = createMockStorage([
      { id: localOnly, createdAt: 100, event: {} as never },
      { id: shared, createdAt: 200, event: {} as never },
    ]);

    const serverNeg = createServerNeg([
      { id: shared, createdAt: 200 },
    ]);

    const relay = createMockRelay(serverNeg);

    const result = await Effect.runPromise(
      reconcileWithRelay(storage, relay, "wss://test.example.com", "pubkey123"),
    );

    expect(result.haveIds).toContain(localOnly);
    expect(result.haveIds).not.toContain(shared);
  });

  it("returns empty arrays when local and relay are in sync", async () => {
    const id1 = hexId(5);
    const id2 = hexId(6);

    const items = [
      { id: id1, createdAt: 100 },
      { id: id2, createdAt: 200 },
    ];

    const storage = createMockStorage(
      items.map((i) => ({ ...i, event: {} as never })),
    );
    const serverNeg = createServerNeg(items);
    const relay = createMockRelay(serverNeg);

    const result = await Effect.runPromise(
      reconcileWithRelay(storage, relay, "wss://test.example.com", "pubkey123"),
    );

    expect(result.needIds).toHaveLength(0);
    expect(result.haveIds).toHaveLength(0);
  });

  it("returns resolved strings, not Promise objects (regression for Effect.try vs tryPromise)", async () => {
    const remoteOnly = hexId(7);

    const storage = createMockStorage([]);
    const serverNeg = createServerNeg([{ id: remoteOnly, createdAt: 100 }]);
    const relay = createMockRelay(serverNeg);

    const result = await Effect.runPromise(
      reconcileWithRelay(storage, relay, "wss://test.example.com", "pubkey123"),
    );

    // This is the key regression test: if Effect.try is used instead of
    // Effect.tryPromise, initiate() returns a Promise object which is truthy
    // but not a valid hex string. The result would have 0 needIds because
    // the relay can't parse "[object Promise]" as a negentropy message.
    expect(result.needIds.length).toBeGreaterThan(0);
    expect(result.needIds[0]).toBe(remoteOnly);

    // Verify the IDs are actual hex strings, not Promise objects
    for (const id of result.needIds) {
      expect(typeof id).toBe("string");
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
