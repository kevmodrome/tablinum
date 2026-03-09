import { Effect, Exit, Scope } from "effect";
import type { SchemaConfig } from "../schema/types.ts";
import {
  createLocalstr as coreCreateLocalstr,
  type LocalstrConfig,
} from "../db/create-localstr.ts";
import { Database } from "./database.svelte.ts";

// Re-export schema utilities (unchanged)
export { field } from "../schema/field.ts";
export { collection } from "../schema/collection.ts";
export type { CollectionDef, CollectionFields } from "../schema/collection.ts";
export type { FieldDef, FieldKind } from "../schema/field.ts";
export type { InferRecord, SchemaConfig } from "../schema/types.ts";
export type { LocalstrConfig } from "../db/create-localstr.ts";
export type { SyncStatus } from "../db/database-handle.ts";

// Re-export errors
export {
  ValidationError,
  StorageError,
  CryptoError,
  RelayError,
  SyncError,
  NotFoundError,
  ClosedError,
} from "../errors.ts";

// Re-export Svelte classes
export { Database } from "./database.svelte.ts";
export { Collection } from "./collection.svelte.ts";
export { LiveQuery } from "./live-query.svelte.ts";
export type {
  SvelteQueryBuilder,
  SvelteWhereClause,
  SvelteOrderByBuilder,
} from "./query.svelte.ts";

export async function createLocalstr<S extends SchemaConfig>(
  config: LocalstrConfig<S>,
): Promise<Database<S>> {
  const scope = Effect.runSync(Scope.make());
  try {
    const handle = await Effect.runPromise(
      coreCreateLocalstr(config).pipe(Effect.provideService(Scope.Scope, scope)),
    );
    return new Database(handle, scope) as Database<S>;
  } catch (e) {
    await Effect.runPromise(Scope.close(scope, Exit.fail(e)));
    throw e;
  }
}
