import { Option, Schema } from "effect";
import { getPublicKey } from "nostr-tools/pure";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { EpochId, DatabaseName } from "../brands.ts";
export { EpochId, DatabaseName };
export { bytesToHex, hexToBytes };

export interface EpochKeyInput {
  readonly epochId: EpochId;
  readonly key: string;
}

export interface EpochKey {
  readonly id: EpochId;
  readonly privateKey: string;
  readonly publicKey: string;
  readonly createdBy: string;
  readonly parentEpoch?: EpochId;
}

export interface EpochStore {
  readonly epochs: Map<EpochId, EpochKey>;
  readonly keysByPublicKey: Map<string, Uint8Array>;
  currentEpochId: EpochId;
}

const HexKeySchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/i));

export const EpochKeyInputSchema = Schema.Struct({
  epochId: Schema.String,
  key: HexKeySchema,
});

const PersistedEpochSchema = Schema.Struct({
  id: Schema.String,
  privateKey: HexKeySchema,
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
    readonly createdBy: string;
    readonly parentEpoch?: string;
  }>;
  readonly currentEpochId: string;
}

export function createEpochKey(
  id: EpochId,
  privateKeyHex: string,
  createdBy: string,
  parentEpoch?: EpochId,
): EpochKey {
  const publicKey = getPublicKey(hexToBytes(privateKeyHex));
  const base = { id, privateKey: privateKeyHex, publicKey, createdBy };
  return parentEpoch !== undefined ? { ...base, parentEpoch } : base;
}

export function createEpochStore(initialEpoch: EpochKey): EpochStore {
  const epochs = new Map<EpochId, EpochKey>();
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
    createEpochKey(
      EpochId(epoch.id),
      epoch.privateKey,
      epoch.createdBy,
      epoch.parentEpoch !== undefined ? EpochId(epoch.parentEpoch) : undefined,
    ),
  );
  if (!firstEpoch) {
    throw new Error("Epoch snapshot must contain at least one epoch");
  }

  const store = createEpochStore(firstEpoch);
  for (const epoch of remainingEpochs) {
    addEpoch(store, epoch);
  }
  store.currentEpochId = EpochId(snapshot.currentEpochId);
  return store;
}

export function createEpochStoreFromInputs(
  epochKeys: ReadonlyArray<EpochKeyInput>,
  options: {
    readonly createdBy?: string | undefined;
  } = {},
): EpochStore {
  if (epochKeys.length === 0) {
    throw new Error("Epoch input must contain at least one key");
  }

  const createdBy = options.createdBy ?? "";
  const epochs = epochKeys.map((epochKey, index) =>
    createEpochKey(
      epochKey.epochId,
      epochKey.key,
      createdBy,
      index > 0 ? epochKeys[index - 1]!.epochId : undefined,
    ),
  );

  const store = createEpochStore(epochs[0]!);
  for (let i = 1; i < epochs.length; i++) {
    addEpoch(store, epochs[i]!);
  }
  store.currentEpochId = epochs[epochs.length - 1]!.id;
  return store;
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
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((epoch) => ({ epochId: epoch.id, key: epoch.privateKey }));
}

function serializeEpochStore(store: EpochStore): EpochStoreSnapshot {
  return {
    epochs: Array.from(store.epochs.values()).map((epoch) => ({
      id: epoch.id,
      privateKey: epoch.privateKey,
      createdBy: epoch.createdBy,
      ...(epoch.parentEpoch !== undefined ? { parentEpoch: epoch.parentEpoch } : {}),
    })),
    currentEpochId: store.currentEpochId,
  };
}

export function stringifyEpochStore(store: EpochStore): string {
  return JSON.stringify(serializeEpochStore(store));
}

export function deserializeEpochStore(raw: string): Option.Option<EpochStore> {
  try {
    return Option.some(hydrateEpochStore(decodePersistedEpochStore(raw)));
  } catch {
    return Option.none();
  }
}
