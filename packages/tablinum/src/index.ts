export { field } from "./schema/field.ts";
export { collection } from "./schema/collection.ts";
export type { CollectionDef, CollectionFields } from "./schema/collection.ts";
export type { FieldDef, FieldKind } from "./schema/field.ts";
export type { InferRecord, SchemaConfig } from "./schema/types.ts";

export { createTablinum } from "./db/create-tablinum.ts";
export type { TablinumConfig, TablinumLogLevel } from "./db/create-tablinum.ts";
export { LogLevel } from "effect";
export type { DatabaseHandle, SyncStatus } from "./db/database-handle.ts";

export { encodeInvite, decodeInvite } from "./db/invite.ts";
export type { Invite } from "./db/invite.ts";

export { EpochId, DatabaseName } from "./brands.ts";

export type { EpochKey, EpochKeyInput } from "./db/epoch.ts";
export type { MemberRecord, AuthorProfile } from "./db/members.ts";

export type { CollectionHandle } from "./crud/collection-handle.ts";
export type { CollectionOptions } from "./schema/collection.ts";
export type { WhereClause, QueryBuilder, OrderByBuilder } from "./crud/query-builder.ts";

export { TablinumLive } from "./layers/TablinumLive.ts";
export type { TablinumConfigShape } from "./services/Config.ts";

export {
  ValidationError,
  StorageError,
  CryptoError,
  RelayError,
  SyncError,
  NotFoundError,
  ClosedError,
} from "./errors.ts";
