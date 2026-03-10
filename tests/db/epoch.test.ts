import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  createEpochKey,
  createEpochStore,
  addEpoch,
  getCurrentEpoch,
  getCurrentPublicKey,
  getAllPublicKeys,
  getDecryptionKey,
  bytesToHex,
  hexToBytes,
} from "../../src/db/epoch.ts";

describe("epoch", () => {
  const makeKeyHex = () => bytesToHex(generateSecretKey());

  it("creates an epoch key with correct public key derivation", () => {
    const keyHex = makeKeyHex();
    const epoch = createEpochKey("e1", keyHex, Date.now(), "creator");
    expect(epoch.id).toBe("e1");
    expect(epoch.privateKey).toBe(keyHex);
    expect(epoch.publicKey).toBe(getPublicKey(hexToBytes(keyHex)));
    expect(epoch.createdBy).toBe("creator");
  });

  it("creates an epoch store with initial epoch", () => {
    const keyHex = makeKeyHex();
    const epoch = createEpochKey("e0", keyHex, Date.now(), "creator");
    const store = createEpochStore(epoch);
    expect(store.currentEpochId).toBe("e0");
    expect(store.epochs.size).toBe(1);
    expect(store.keysByPublicKey.size).toBe(1);
  });

  it("adds epochs and tracks them", () => {
    const k1 = makeKeyHex();
    const k2 = makeKeyHex();
    const e1 = createEpochKey("e1", k1, 1000, "c1");
    const e2 = createEpochKey("e2", k2, 2000, "c2", "e1");
    const store = createEpochStore(e1);
    addEpoch(store, e2);
    store.currentEpochId = "e2";

    expect(store.epochs.size).toBe(2);
    expect(getCurrentEpoch(store).id).toBe("e2");
    expect(getAllPublicKeys(store)).toHaveLength(2);
  });

  it("looks up decryption key by public key", () => {
    const keyHex = makeKeyHex();
    const epoch = createEpochKey("e0", keyHex, Date.now(), "c");
    const store = createEpochStore(epoch);

    const decKey = getDecryptionKey(store, epoch.publicKey);
    expect(decKey).toBeDefined();
    expect(bytesToHex(decKey!)).toBe(keyHex);

    expect(getDecryptionKey(store, "nonexistent")).toBeUndefined();
  });

  it("getCurrentPublicKey returns the current epoch's public key", () => {
    const k1 = makeKeyHex();
    const k2 = makeKeyHex();
    const e1 = createEpochKey("e1", k1, 1000, "c");
    const e2 = createEpochKey("e2", k2, 2000, "c", "e1");
    const store = createEpochStore(e1);

    expect(getCurrentPublicKey(store)).toBe(e1.publicKey);

    addEpoch(store, e2);
    store.currentEpochId = "e2";
    expect(getCurrentPublicKey(store)).toBe(e2.publicKey);
  });

  it("parentEpoch tracks the chain", () => {
    const k1 = makeKeyHex();
    const k2 = makeKeyHex();
    const k3 = makeKeyHex();
    const e1 = createEpochKey("e1", k1, 1000, "c");
    const e2 = createEpochKey("e2", k2, 2000, "c", "e1");
    const e3 = createEpochKey("e3", k3, 3000, "c", "e2");

    expect(e1.parentEpoch).toBeUndefined();
    expect(e2.parentEpoch).toBe("e1");
    expect(e3.parentEpoch).toBe("e2");
  });
});
