import { Option, Schema } from "effect";
import { getPublicKey } from "nostr-tools/pure";

export interface EpochKeyInput {
  readonly epochId: string;
  readonly key: string;
}

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

const HexKeySchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/i));

export const EpochKeyInputSchema = Schema.Struct({
  epochId: Schema.String,
  key: HexKeySchema,
});

const PersistedEpochSchema = Schema.Struct({
  id: Schema.String,
  privateKey: HexKeySchema,
  createdAt: Schema.Number,
  createdBy: Schema.String,
  parentEpoch: Schema.optionalKey(Schema.String),
});

const PersistedEpochStoreSchema = Schema.Struct({
  epochs: Schema.Array(PersistedEpochSchema),
  currentEpochId: Schema.String,
});

const decodePersistedEpochStore = Schema.decodeUnknownSync(
  Schema.fromJsonString(PersistedEpochStoreSchema),
);

interface EpochStoreSnapshot {
  readonly epochs: ReadonlyArray<{
    readonly id: string;
    readonly privateKey: string;
    readonly createdAt: number;
    readonly createdBy: string;
    readonly parentEpoch?: string;
  }>;
  readonly currentEpochId: string;
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

export function hydrateEpochStore(snapshot: EpochStoreSnapshot): EpochStore {
  const [firstEpoch, ...remainingEpochs] = snapshot.epochs.map((epoch) =>
    createEpochKey(epoch.id, epoch.privateKey, epoch.createdAt, epoch.createdBy, epoch.parentEpoch),
  );
  if (!firstEpoch) {
    throw new Error("Epoch snapshot must contain at least one epoch");
  }

  const store = createEpochStore(firstEpoch);
  for (const epoch of remainingEpochs) {
    addEpoch(store, epoch);
  }
  store.currentEpochId = snapshot.currentEpochId;
  return store;
}

export function createEpochStoreFromInputs(
  epochKeys: ReadonlyArray<EpochKeyInput>,
  options: {
    readonly createdAtBase?: number | undefined;
    readonly createdBy?: string | undefined;
  } = {},
): EpochStore {
  if (epochKeys.length === 0) {
    throw new Error("Epoch input must contain at least one key");
  }

  const createdAtBase = options.createdAtBase ?? Date.now();
  const createdBy = options.createdBy ?? "";
  const epochs = epochKeys.map((epochKey, index) =>
    createEpochKey(
      epochKey.epochId,
      epochKey.key,
      createdAtBase + index,
      createdBy,
      index > 0 ? epochKeys[index - 1]!.epochId : undefined,
    ),
  );

  return hydrateEpochStore({
    epochs,
    currentEpochId: epochs[epochs.length - 1]!.id,
  });
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

export function exportEpochKeys(store: EpochStore): ReadonlyArray<EpochKeyInput> {
  return Array.from(store.epochs.values())
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((epoch) => ({ epochId: epoch.id, key: epoch.privateKey }));
}

function serializeEpochStore(store: EpochStore): EpochStoreSnapshot {
  return {
    epochs: Array.from(store.epochs.values()).map((epoch) => ({
      id: epoch.id,
      privateKey: epoch.privateKey,
      createdAt: epoch.createdAt,
      createdBy: epoch.createdBy,
      ...(epoch.parentEpoch !== undefined ? { parentEpoch: epoch.parentEpoch } : {}),
    })),
    currentEpochId: store.currentEpochId,
  };
}

export function persistEpochs(store: EpochStore, dbName: string): void {
  if (typeof globalThis.localStorage === "undefined") return;
  globalThis.localStorage.setItem(
    `tablinum-epochs-${dbName}`,
    JSON.stringify(serializeEpochStore(store)),
  );
}

export function loadPersistedEpochs(dbName: string): Option.Option<EpochStore> {
  if (typeof globalThis.localStorage === "undefined") return Option.none();
  const raw = globalThis.localStorage.getItem(`tablinum-epochs-${dbName}`);
  if (!raw) return Option.none();
  try {
    return Option.some(hydrateEpochStore(decodePersistedEpochStore(raw)));
  } catch {
    return Option.none();
  }
}
