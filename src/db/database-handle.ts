import type { Effect, Stream } from "effect";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { CollectionHandle } from "../crud/collection-handle.ts";
import type { InferRecord, SchemaConfig } from "../schema/types.ts";
import type { ClosedError, StorageError, SyncError, RelayError, CryptoError } from "../errors.ts";
import type { Invite } from "./invite.ts";

export type SyncStatus = "idle" | "syncing";

export interface DatabaseHandle<S extends SchemaConfig> {
  readonly collection: <K extends string & keyof S>(name: K) => CollectionHandle<S[K]>;
  readonly exportKey: () => string;
  readonly exportInvite: () => Invite;
  readonly close: () => Effect.Effect<void, StorageError>;
  readonly rebuild: () => Effect.Effect<void, StorageError>;
  readonly sync: () => Effect.Effect<void, SyncError | RelayError | CryptoError | StorageError>;
  readonly getSyncStatus: () => Effect.Effect<SyncStatus>;
}
