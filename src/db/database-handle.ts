import type { Effect } from "effect";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { CollectionHandle } from "../crud/collection-handle.ts";
import type { SchemaConfig } from "../schema/types.ts";
import type {
  StorageError,
  SyncError,
  RelayError,
  CryptoError,
  ValidationError,
} from "../errors.ts";
import type { Invite } from "./invite.ts";
import type { MemberRecord } from "./members.ts";
import type { RelayStatus } from "../sync/relay.ts";

export type SyncStatus = "idle" | "syncing";

export interface DatabaseHandle<S extends SchemaConfig> {
  readonly collection: <K extends string & keyof S>(name: K) => CollectionHandle<S[K]>;
  readonly publicKey: string;
  readonly members: CollectionHandle<CollectionDef<CollectionFields>>;
  readonly exportKey: () => string;
  readonly exportInvite: () => Invite;
  readonly close: () => Effect.Effect<void, StorageError>;
  readonly rebuild: () => Effect.Effect<void, StorageError>;
  readonly sync: () => Effect.Effect<void, SyncError | RelayError | CryptoError | StorageError>;
  readonly getSyncStatus: () => Effect.Effect<SyncStatus>;
  readonly subscribeSyncStatus: (callback: (status: SyncStatus) => void) => () => void;
  readonly pendingCount: () => Effect.Effect<number>;
  readonly subscribePendingCount: (callback: (count: number) => void) => () => void;
  readonly getRelayStatus: () => RelayStatus;
  readonly subscribeRelayStatus: (callback: (status: RelayStatus) => void) => () => void;
  readonly addMember: (
    pubkey: string,
  ) => Effect.Effect<void, ValidationError | StorageError | CryptoError>;
  readonly removeMember: (
    pubkey: string,
  ) => Effect.Effect<void, ValidationError | StorageError | SyncError | RelayError | CryptoError>;
  readonly getMembers: () => Effect.Effect<ReadonlyArray<MemberRecord>, StorageError>;
  readonly setProfile: (profile: {
    name?: string;
    picture?: string;
    about?: string;
    nip05?: string;
  }) => Effect.Effect<void, ValidationError | StorageError | CryptoError>;
}
