import type { SchemaConfig } from "../schema/types.ts";
import type { TablinumConfig } from "../db/create-tablinum.ts";
import { Tablinum } from "./tablinum.svelte.ts";

export { field } from "../schema/field.ts";
export { collection } from "../schema/collection.ts";
export type { CollectionDef, CollectionFields } from "../schema/collection.ts";
export type { FieldDef, FieldKind } from "../schema/field.ts";
export type { InferRecord, SchemaConfig } from "../schema/types.ts";
export type { TablinumConfig } from "../db/create-tablinum.ts";
export type { SyncStatus } from "../db/database-handle.ts";

export { encodeInvite, decodeInvite } from "../db/invite.ts";
export type { Invite } from "../db/invite.ts";

export type { EpochKey, EpochKeyInput } from "../db/epoch.ts";
export type { MemberRecord } from "../db/members.ts";

export {
  ValidationError,
  StorageError,
  CryptoError,
  RelayError,
  SyncError,
  NotFoundError,
  ClosedError,
} from "../errors.ts";

export { Tablinum } from "./tablinum.svelte.ts";
export { Collection } from "./collection.svelte.ts";
export type {
  SvelteQueryBuilder,
  SvelteWhereClause,
  SvelteOrderByBuilder,
} from "./query.svelte.ts";

/** @deprecated Use `new Tablinum(config)` instead. */
export async function createTablinum<S extends SchemaConfig>(
  config: TablinumConfig<S>,
): Promise<Tablinum<S>> {
  const db = new Tablinum(config);
  await db.ready;
  return db;
}
