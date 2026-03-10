import { getPublicKey } from "nostr-tools/pure";

export interface EpochKey {
  readonly id: string;
  readonly privateKey: string;
  readonly publicKey: string;
  readonly createdAt: number;
  readonly createdBy: string;
  readonly parentEpoch?: string;
}

export interface EpochStore {
  readonly epochs: Map<string, EpochKey>;
  readonly keysByPublicKey: Map<string, Uint8Array>;
  currentEpochId: string;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createEpochKey(
  id: string,
  privateKeyHex: string,
  createdAt: number,
  createdBy: string,
  parentEpoch?: string,
): EpochKey {
  const publicKey = getPublicKey(hexToBytes(privateKeyHex));
  const base = { id, privateKey: privateKeyHex, publicKey, createdAt, createdBy };
  return parentEpoch !== undefined ? { ...base, parentEpoch } : base;
}

export function createEpochStore(initialEpoch: EpochKey): EpochStore {
  const epochs = new Map<string, EpochKey>();
  const keysByPublicKey = new Map<string, Uint8Array>();
  epochs.set(initialEpoch.id, initialEpoch);
  keysByPublicKey.set(initialEpoch.publicKey, hexToBytes(initialEpoch.privateKey));
  return { epochs, keysByPublicKey, currentEpochId: initialEpoch.id };
}

export function addEpoch(store: EpochStore, epoch: EpochKey): void {
  store.epochs.set(epoch.id, epoch);
  store.keysByPublicKey.set(epoch.publicKey, hexToBytes(epoch.privateKey));
}

export function getCurrentEpoch(store: EpochStore): EpochKey {
  return store.epochs.get(store.currentEpochId)!;
}

export function getCurrentPublicKey(store: EpochStore): string {
  return getCurrentEpoch(store).publicKey;
}

export function getAllPublicKeys(store: EpochStore): string[] {
  return Array.from(store.keysByPublicKey.keys());
}

export function getDecryptionKey(store: EpochStore, publicKey: string): Uint8Array | undefined {
  return store.keysByPublicKey.get(publicKey);
}

export function persistEpochs(store: EpochStore, dbName: string): void {
  if (typeof globalThis.localStorage === "undefined") return;
  const data = {
    epochs: Array.from(store.epochs.values()).map((e) => ({
      id: e.id,
      privateKey: e.privateKey,
      createdAt: e.createdAt,
      createdBy: e.createdBy,
      parentEpoch: e.parentEpoch,
    })),
    currentEpochId: store.currentEpochId,
  };
  globalThis.localStorage.setItem(`tablinum-epochs-${dbName}`, JSON.stringify(data));
}

export function loadPersistedEpochs(
  dbName: string,
): { epochs: EpochKey[]; currentEpochId: string } | null {
  if (typeof globalThis.localStorage === "undefined") return null;
  const raw = globalThis.localStorage.getItem(`tablinum-epochs-${dbName}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.epochs) || typeof data.currentEpochId !== "string") return null;
    const epochs: EpochKey[] = data.epochs.map((e: Record<string, unknown>) =>
      createEpochKey(
        e.id as string,
        e.privateKey as string,
        e.createdAt as number,
        e.createdBy as string,
        e.parentEpoch as string | undefined,
      ),
    );
    return { epochs, currentEpochId: data.currentEpochId };
  } catch {
    return null;
  }
}
