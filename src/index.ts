// Schema
export { field } from "./schema/field.ts";
export { collection } from "./schema/collection.ts";
export type { CollectionDef, CollectionFields } from "./schema/collection.ts";
export type { FieldDef, FieldKind } from "./schema/field.ts";
export type { InferRecord, SchemaConfig } from "./schema/types.ts";

// Database
export { createLocalstr } from "./db/create-localstr.ts";
export type { LocalstrConfig } from "./db/create-localstr.ts";
export type { DatabaseHandle, SyncStatus } from "./db/database-handle.ts";

// CRUD
export type { CollectionHandle } from "./crud/collection-handle.ts";
export type { WhereClause, QueryExecutor, QuerySpec } from "./crud/query-builder.ts";

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
