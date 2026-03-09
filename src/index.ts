// Schema
export { field } from "./schema/field.ts";
export { collection } from "./schema/collection.ts";
export type { CollectionDef, CollectionFields } from "./schema/collection.ts";
export type { FieldDef, FieldKind } from "./schema/field.ts";
export type { InferRecord, SchemaConfig } from "./schema/types.ts";

// Database
export { createTablinum } from "./db/create-tablinum.ts";
export type { TablinumConfig } from "./db/create-tablinum.ts";
export type { DatabaseHandle, SyncStatus } from "./db/database-handle.ts";

// Invite
export { encodeInvite, decodeInvite } from "./db/invite.ts";
export type { Invite } from "./db/invite.ts";

// CRUD
export type { CollectionHandle } from "./crud/collection-handle.ts";
export type { CollectionOptions } from "./schema/collection.ts";
export type {
  WhereClause,
  QueryBuilder,
  OrderByBuilder,
  QueryExecutor,
} from "./crud/query-builder.ts";

// Errors
export {
  ValidationError,
  StorageError,
  CryptoError,
  RelayError,
  SyncError,
  NotFoundError,
  ClosedError,
} from "./errors.ts";
