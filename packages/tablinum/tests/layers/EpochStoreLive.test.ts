import { describe, expect, it } from "vitest";
import { Effect, Layer, LogLevel } from "effect";
import { generateSecretKey } from "nostr-tools/pure";
import { bytesToHex } from "@noble/hashes/utils.js";
import { EpochStoreLive } from "../../src/layers/EpochStoreLive.ts";
import { EpochStore } from "../../src/services/EpochStore.ts";
import { Config } from "../../src/services/Config.ts";
import { Identity } from "../../src/services/Identity.ts";
import { Storage } from "../../src/services/Storage.ts";
import { createIdentity } from "../../src/db/identity.ts";
import { EpochId, DatabaseName } from "../../src/brands.ts";
import {
  stringifyEpochStore,
  createEpochStoreFromInputs,
  addEpoch,
  createEpochKey,
} from "../../src/db/epoch.ts";

const makeKeyHex = () => bytesToHex(generateSecretKey());

function createMockStorage(initialMeta: Record<string, unknown> = {}) {
  const meta = new Map<string, unknown>(Object.entries(initialMeta));
  const stub = () => Effect.die("not implemented");
  return {
    handle: {
      putRecord: stub,
      getRecord: stub,
      getAllRecords: stub,
      countRecords: stub,
      clearRecords: stub,
      getByIndex: stub,
      getByIndexRange: stub,
      getAllSorted: stub,
      putEvent: stub,
      getEvent: stub,
      getAllEvents: stub,
      getEventsByRecord: stub,
      putGiftWrap: stub,
      getGiftWrap: stub,
      getAllGiftWraps: stub,
      deleteGiftWrap: stub,
      deleteEvent: stub,
      stripEventData: stub,
      close: stub,
      getMeta: (key: string) => Effect.succeed(meta.get(key)),
      putMeta: (key: string, value: unknown) =>
        Effect.sync(() => {
          meta.set(key, value);
        }),
    } as any,
    meta,
  };
}

function makeTestLayer(options: {
  epochKeys?: Array<{ epochId: EpochId; key: string }>;
  storedEpochs?: string; // serialized epoch store already in IDB
}) {
  const storage = createMockStorage(
    options.storedEpochs ? { epochs: options.storedEpochs } : {},
  );

  const configLayer = Layer.effect(
    Config,
    Effect.succeed({
      relays: ["wss://relay.example.com"],
      dbName: DatabaseName("test"),
      schema: {},
      logLevel: LogLevel.None,
      epochKeys: options.epochKeys,
    } as any),
  );

  const identityLayer = Layer.effect(
    Identity,
    Effect.gen(function* () {
      return yield* createIdentity();
    }),
  );

  const storageLayer = Layer.succeed(Storage, storage.handle);

  const layer = EpochStoreLive.pipe(
    Layer.provide(configLayer),
    Layer.provide(identityLayer),
    Layer.provide(storageLayer),
  );

  return { layer, storage };
}

function resolveEpochStore(layer: Layer.Layer<typeof EpochStore.Type>) {
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* EpochStore;
    }).pipe(Effect.provide(layer), Effect.scoped),
  );
}

describe("EpochStoreLive", () => {
  it("generates a fresh epoch when no IDB and no config", async () => {
    const { layer } = makeTestLayer({});
    const store = await resolveEpochStore(layer);

    expect(store.epochs.size).toBe(1);
    expect(store.currentEpochId).toBe("epoch-0");
  });

  it("uses config.epochKeys when no IDB exists", async () => {
    const key1 = makeKeyHex();
    const key2 = makeKeyHex();
    const epochKeys = [
      { epochId: EpochId("invite-e1"), key: key1 },
      { epochId: EpochId("invite-e2"), key: key2 },
    ];

    const { layer } = makeTestLayer({ epochKeys });
    const store = await resolveEpochStore(layer);

    expect(store.epochs.size).toBe(2);
    expect(store.epochs.get(EpochId("invite-e1"))!.privateKey).toBe(key1);
    expect(store.epochs.get(EpochId("invite-e2"))!.privateKey).toBe(key2);
    expect(store.currentEpochId).toBe("invite-e2");
  });

  it("uses IDB when no config.epochKeys provided", async () => {
    const key = makeKeyHex();
    const idbStore = createEpochStoreFromInputs([
      { epochId: EpochId("stored-e1"), key },
    ]);

    const { layer } = makeTestLayer({
      storedEpochs: stringifyEpochStore(idbStore),
    });
    const store = await resolveEpochStore(layer);

    expect(store.epochs.size).toBe(1);
    expect(store.currentEpochId).toBe("stored-e1");
    expect(store.epochs.get(EpochId("stored-e1"))!.privateKey).toBe(key);
  });

  it("uses IDB when config.epochKeys are a subset (post-rotation restart)", async () => {
    // Simulate: invite had e1, then e2 was added via rotation
    const key1 = makeKeyHex();
    const key2 = makeKeyHex();

    const idbStore = createEpochStoreFromInputs([
      { epochId: EpochId("e1"), key: key1 },
    ]);
    addEpoch(idbStore, createEpochKey(EpochId("e2"), key2, "someone", EpochId("e1")));
    idbStore.currentEpochId = EpochId("e2");

    // Config still has original invite key (subset of IDB)
    const epochKeys = [{ epochId: EpochId("e1"), key: key1 }];

    const { layer } = makeTestLayer({
      epochKeys,
      storedEpochs: stringifyEpochStore(idbStore),
    });
    const store = await resolveEpochStore(layer);

    // Should use IDB (has the rotated epoch too)
    expect(store.epochs.size).toBe(2);
    expect(store.currentEpochId).toBe("e2");
    expect(store.epochs.has(EpochId("e2"))).toBe(true);
  });

  it("replaces IDB when config.epochKeys have unknown keys (new invite)", async () => {
    // IDB has epochs from old database
    const oldKey = makeKeyHex();
    const oldStore = createEpochStoreFromInputs([
      { epochId: EpochId("old-e1"), key: oldKey },
    ]);

    // Config has completely different keys from a new invite
    const newKey = makeKeyHex();
    const epochKeys = [{ epochId: EpochId("new-e1"), key: newKey }];

    const { layer, storage } = makeTestLayer({
      epochKeys,
      storedEpochs: stringifyEpochStore(oldStore),
    });
    const store = await resolveEpochStore(layer);

    // Should use config keys, not IDB
    expect(store.epochs.size).toBe(1);
    expect(store.currentEpochId).toBe("new-e1");
    expect(store.epochs.get(EpochId("new-e1"))!.privateKey).toBe(newKey);
    expect(store.epochs.has(EpochId("old-e1"))).toBe(false);

    // Should have persisted the new keys to IDB
    expect(storage.meta.get("epochs")).toBeDefined();
  });

  it("replaces IDB when same epoch ID has different key (different database)", async () => {
    // Both have epoch-0 but with different keys
    const oldKey = makeKeyHex();
    const newKey = makeKeyHex();

    const oldStore = createEpochStoreFromInputs([
      { epochId: EpochId("epoch-0"), key: oldKey },
    ]);

    const epochKeys = [{ epochId: EpochId("epoch-0"), key: newKey }];

    const { layer } = makeTestLayer({
      epochKeys,
      storedEpochs: stringifyEpochStore(oldStore),
    });
    const store = await resolveEpochStore(layer);

    // Should use config's key, not IDB's
    expect(store.epochs.get(EpochId("epoch-0"))!.privateKey).toBe(newKey);
  });
});
