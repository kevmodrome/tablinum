import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  createEpochKey,
  createEpochStore,
  createEpochStoreFromInputs,
  addEpoch,
  getCurrentEpoch,
  getCurrentPublicKey,
  getAllPublicKeys,
  getDecryptionKey,
  exportEpochKeys,
  bytesToHex,
  hexToBytes,
  stringifyEpochStore,
  deserializeEpochStore,
} from "../../src/db/epoch.ts";
import { EpochId } from "../../src/brands.ts";
import { Option } from "effect";

describe("epoch", () => {
  const makeKeyHex = () => bytesToHex(generateSecretKey());

  it("creates an epoch key with correct public key derivation", () => {
    const keyHex = makeKeyHex();
    const epoch = createEpochKey(EpochId("e1"), keyHex, "creator");
    expect(epoch.id).toBe("e1");
    expect(epoch.privateKey).toBe(keyHex);
    expect(epoch.publicKey).toBe(getPublicKey(hexToBytes(keyHex)));
    expect(epoch.createdBy).toBe("creator");
  });

  it("creates an epoch store with initial epoch", () => {
    const keyHex = makeKeyHex();
    const epoch = createEpochKey(EpochId("e0"), keyHex, "creator");
    const store = createEpochStore(epoch);
    expect(store.currentEpochId).toBe("e0");
    expect(store.epochs.size).toBe(1);
    expect(store.keysByPublicKey.size).toBe(1);
  });

  it("adds epochs and tracks them", () => {
    const k1 = makeKeyHex();
    const k2 = makeKeyHex();
    const e1 = createEpochKey(EpochId("e1"), k1, "c1");
    const e2 = createEpochKey(EpochId("e2"), k2, "c2", EpochId("e1"));
    const store = createEpochStore(e1);
    addEpoch(store, e2);
    store.currentEpochId = EpochId("e2");

    expect(store.epochs.size).toBe(2);
    expect(getCurrentEpoch(store).id).toBe("e2");
    expect(getAllPublicKeys(store)).toHaveLength(2);
  });

  it("looks up decryption key by public key", () => {
    const keyHex = makeKeyHex();
    const epoch = createEpochKey(EpochId("e0"), keyHex, "c");
    const store = createEpochStore(epoch);

    const decKey = getDecryptionKey(store, epoch.publicKey);
    expect(decKey).toBeDefined();
    expect(bytesToHex(decKey!)).toBe(keyHex);

    expect(getDecryptionKey(store, "nonexistent")).toBeUndefined();
  });

  it("getCurrentPublicKey returns the current epoch's public key", () => {
    const k1 = makeKeyHex();
    const k2 = makeKeyHex();
    const e1 = createEpochKey(EpochId("e1"), k1, "c");
    const e2 = createEpochKey(EpochId("e2"), k2, "c", EpochId("e1"));
    const store = createEpochStore(e1);

    expect(getCurrentPublicKey(store)).toBe(e1.publicKey);

    addEpoch(store, e2);
    store.currentEpochId = EpochId("e2");
    expect(getCurrentPublicKey(store)).toBe(e2.publicKey);
  });

  it("parentEpoch tracks the chain", () => {
    const k1 = makeKeyHex();
    const k2 = makeKeyHex();
    const k3 = makeKeyHex();
    const e1 = createEpochKey(EpochId("e1"), k1, "c");
    const e2 = createEpochKey(EpochId("e2"), k2, "c", EpochId("e1"));
    const e3 = createEpochKey(EpochId("e3"), k3, "c", EpochId("e2"));

    expect(e1.parentEpoch).toBeUndefined();
    expect(e2.parentEpoch).toBe("e1");
    expect(e3.parentEpoch).toBe("e2");
  });

  it("builds an epoch store from ordered input keys", () => {
    const epochKeys = [
      { epochId: EpochId("e1"), key: makeKeyHex() },
      { epochId: EpochId("e2"), key: makeKeyHex() },
      { epochId: EpochId("e3"), key: makeKeyHex() },
    ] as const;

    const store = createEpochStoreFromInputs(epochKeys);

    expect(store.currentEpochId).toBe("e3");
    expect(store.epochs.get(EpochId("e2"))!.parentEpoch).toBe("e1");
    expect(store.epochs.get(EpochId("e3"))!.parentEpoch).toBe("e2");
    expect(exportEpochKeys(store)).toEqual(epochKeys);
  });

  it("round-trips epoch state through serialize/deserialize", () => {
    const k1 = makeKeyHex();
    const k2 = makeKeyHex();
    const e1 = createEpochKey(EpochId("e1"), k1, "c1");
    const e2 = createEpochKey(EpochId("e2"), k2, "c2", EpochId("e1"));
    const store = createEpochStore(e1);
    addEpoch(store, e2);
    store.currentEpochId = EpochId("e2");

    const serialized = stringifyEpochStore(store);
    const deserialized = deserializeEpochStore(serialized);

    expect(Option.isSome(deserialized)).toBe(true);
    const value = Option.getOrThrow(deserialized);
    expect(value.currentEpochId).toBe("e2");
    expect(Array.from(value.epochs.keys())).toEqual(["e1", "e2"]);
    expect(value.epochs.get(EpochId("e2"))!.parentEpoch).toBe("e1");
  });

  it("deserializes legacy format with createdAt", () => {
    const k1 = makeKeyHex();
    const raw = JSON.stringify({
      epochs: [{ id: "e1", privateKey: k1, createdAt: 1000, createdBy: "c1" }],
      currentEpochId: "e1",
    });
    const result = deserializeEpochStore(raw);
    expect(Option.isSome(result)).toBe(true);
    const value = Option.getOrThrow(result);
    expect(value.currentEpochId).toBe("e1");
  });

  it("rejects invalid persisted epoch state", () => {
    const raw = JSON.stringify({
      epochs: [{ id: "e1", privateKey: "bad", createdBy: "c1" }],
      currentEpochId: "e1",
    });
    expect(Option.isNone(deserializeEpochStore(raw))).toBe(true);
  });
});
