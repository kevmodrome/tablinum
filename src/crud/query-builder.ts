import { Effect, Stream } from "effect";
import type { IDBStorageHandle, StoredRecord } from "../storage/idb.ts";
import type { StorageError, ValidationError } from "../errors.ts";
import { ValidationError as VE } from "../errors.ts";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { FieldDef } from "../schema/field.ts";
import type { WatchContext } from "./watch.ts";
import { watchCollection } from "./watch.ts";

export interface QuerySpec {
  readonly field: string;
  readonly op: "equals";
  readonly value: string | number | boolean;
}

export interface QueryExecutor<T> {
  readonly get: () => Effect.Effect<ReadonlyArray<T>, StorageError>;
  readonly first: () => Effect.Effect<T | null, StorageError>;
  readonly count: () => Effect.Effect<number, StorageError>;
  readonly watch: () => Stream.Stream<ReadonlyArray<T>, StorageError>;
}

export interface WhereClause<T> {
  readonly equals: (value: string | number | boolean) => QueryExecutor<T>;
}

export function createWhereClause<T>(
  storage: IDBStorageHandle,
  watchCtx: WatchContext,
  collectionName: string,
  def: CollectionDef<CollectionFields>,
  fieldName: string,
  mapRecord: (record: StoredRecord) => T,
): Effect.Effect<WhereClause<T>, ValidationError> {
  return Effect.gen(function* () {
    const fieldDef: FieldDef | undefined = def.fields[fieldName];
    if (!fieldDef) {
      return yield* new VE({
        message: `Unknown field "${fieldName}" in collection "${collectionName}"`,
        field: fieldName,
      });
    }
    if (fieldDef.kind === "json" || fieldDef.isArray) {
      return yield* new VE({
        message: `Field "${fieldName}" does not support equality filtering (type: ${fieldDef.kind}${fieldDef.isArray ? "[]" : ""})`,
        field: fieldName,
      });
    }

    const clause: WhereClause<T> = {
      equals: (value) => {
        const filterFn = (record: StoredRecord): boolean => record.data[fieldName] === value;

        return {
          get: () =>
            Effect.gen(function* () {
              const all = yield* storage.getAllRecords(collectionName);
              return all.filter((r) => !r.deleted && filterFn(r)).map(mapRecord);
            }),
          first: () =>
            Effect.gen(function* () {
              const all = yield* storage.getAllRecords(collectionName);
              const found = all.find((r) => !r.deleted && filterFn(r));
              return found ? mapRecord(found) : null;
            }),
          count: () =>
            Effect.gen(function* () {
              const all = yield* storage.getAllRecords(collectionName);
              return all.filter((r) => !r.deleted && filterFn(r)).length;
            }),
          watch: () => watchCollection(watchCtx, storage, collectionName, filterFn, mapRecord),
        };
      },
    };

    return clause;
  });
}
