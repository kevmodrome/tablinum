import { Effect, Stream } from "effect";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { InferRecord } from "../schema/types.ts";
import type { RecordValidator, PartialValidator } from "../schema/validate.ts";
import type { IDBStorageHandle, StoredEvent, StoredRecord } from "../storage/idb.ts";
import { applyEvent } from "../storage/records-store.ts";
import { NotFoundError, StorageError, ValidationError } from "../errors.ts";
import { uuidv7 } from "../utils/uuid.ts";
import type { WatchContext } from "./watch.ts";
import { notifyChange, watchCollection } from "./watch.ts";
import type { WhereClause } from "./query-builder.ts";
import { createWhereClause } from "./query-builder.ts";

export interface CollectionHandle<C extends CollectionDef<CollectionFields>> {
  readonly add: (
    data: Omit<InferRecord<C>, "id">,
  ) => Effect.Effect<string, ValidationError | StorageError>;
  readonly update: (
    id: string,
    data: Partial<Omit<InferRecord<C>, "id">>,
  ) => Effect.Effect<void, ValidationError | StorageError | NotFoundError>;
  readonly delete: (id: string) => Effect.Effect<void, StorageError | NotFoundError>;
  readonly get: (id: string) => Effect.Effect<InferRecord<C>, StorageError | NotFoundError>;
  readonly first: () => Effect.Effect<InferRecord<C> | null, StorageError>;
  readonly count: () => Effect.Effect<number, StorageError>;
  readonly watch: () => Stream.Stream<ReadonlyArray<InferRecord<C>>, StorageError>;
  readonly where: (
    field: string & keyof Omit<InferRecord<C>, "id">,
  ) => Effect.Effect<WhereClause<InferRecord<C>>, ValidationError>;
}

function mapRecord<C extends CollectionDef<CollectionFields>>(
  record: StoredRecord,
): InferRecord<C> {
  return { id: record.id, ...record.data } as InferRecord<C>;
}

export type OnWriteCallback = (event: StoredEvent) => Effect.Effect<void>;

export function createCollectionHandle<C extends CollectionDef<CollectionFields>>(
  def: C,
  storage: IDBStorageHandle,
  watchCtx: WatchContext,
  validator: RecordValidator<C["fields"]>,
  partialValidator: PartialValidator<C["fields"]>,
  makeEventId: () => string,
  onWrite?: OnWriteCallback,
): CollectionHandle<C> {
  const collectionName = def.name;

  const handle: CollectionHandle<C> = {
    add: (data) =>
      Effect.gen(function* () {
        const id = uuidv7();
        const fullRecord = { id, ...data };
        yield* validator(fullRecord);

        const event: StoredEvent = {
          id: makeEventId(),
          collection: collectionName,
          recordId: id,
          kind: "create",
          data: fullRecord as unknown as Record<string, unknown>,
          createdAt: Date.now(),
        };
        yield* storage.putEvent(event);
        yield* applyEvent(storage, event);
        if (onWrite) yield* onWrite(event);
        yield* notifyChange(watchCtx, {
          collection: collectionName,
          recordId: id,
          kind: "create",
        });
        return id;
      }),

    update: (id, data) =>
      Effect.gen(function* () {
        const existing = yield* storage.getRecord(collectionName, id);
        if (!existing || existing.deleted) {
          return yield* new NotFoundError({
            collection: collectionName,
            id,
          });
        }
        yield* partialValidator(data);
        const merged = { ...existing.data, ...data, id };
        yield* validator(merged);

        const event: StoredEvent = {
          id: makeEventId(),
          collection: collectionName,
          recordId: id,
          kind: "update",
          data: merged as Record<string, unknown>,
          createdAt: Date.now(),
        };
        yield* storage.putEvent(event);
        yield* applyEvent(storage, event);
        if (onWrite) yield* onWrite(event);
        yield* notifyChange(watchCtx, {
          collection: collectionName,
          recordId: id,
          kind: "update",
        });
      }),

    delete: (id) =>
      Effect.gen(function* () {
        const existing = yield* storage.getRecord(collectionName, id);
        if (!existing || existing.deleted) {
          return yield* new NotFoundError({
            collection: collectionName,
            id,
          });
        }

        const event: StoredEvent = {
          id: makeEventId(),
          collection: collectionName,
          recordId: id,
          kind: "delete",
          data: null,
          createdAt: Date.now(),
        };
        yield* storage.putEvent(event);
        yield* applyEvent(storage, event);
        if (onWrite) yield* onWrite(event);
        yield* notifyChange(watchCtx, {
          collection: collectionName,
          recordId: id,
          kind: "delete",
        });
      }),

    get: (id) =>
      Effect.gen(function* () {
        const record = yield* storage.getRecord(collectionName, id);
        if (!record || record.deleted) {
          return yield* new NotFoundError({
            collection: collectionName,
            id,
          });
        }
        return mapRecord<C>(record);
      }),

    first: () =>
      Effect.gen(function* () {
        const all = yield* storage.getAllRecords(collectionName);
        const found = all.find((r) => !r.deleted);
        return found ? mapRecord<C>(found) : null;
      }),

    count: () =>
      Effect.gen(function* () {
        const all = yield* storage.getAllRecords(collectionName);
        return all.filter((r) => !r.deleted).length;
      }),

    watch: () =>
      watchCollection<InferRecord<C>>(watchCtx, storage, collectionName, undefined, mapRecord),

    where: (fieldName) =>
      createWhereClause<InferRecord<C>>(
        storage,
        watchCtx,
        collectionName,
        def,
        fieldName,
        mapRecord,
      ),
  };

  return handle;
}
