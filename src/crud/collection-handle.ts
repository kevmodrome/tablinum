import { Effect, Stream } from "effect";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { InferRecord } from "../schema/types.ts";
import type { RecordValidator, PartialValidator } from "../schema/validate.ts";
import type { IDBStorageHandle, StoredEvent } from "../storage/idb.ts";
import { applyEvent } from "../storage/records-store.ts";
import { NotFoundError, StorageError, ValidationError } from "../errors.ts";
import { uuidv7 } from "../utils/uuid.ts";
import type { WatchContext } from "./watch.ts";
import { notifyChange, watchCollection } from "./watch.ts";
import type { WhereClause, OrderByBuilder } from "./query-builder.ts";
import { createWhereClause, createOrderByBuilder } from "./query-builder.ts";

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
  readonly where: (field: string & keyof Omit<InferRecord<C>, "id">) => WhereClause<InferRecord<C>>;
  readonly orderBy: (
    field: string & keyof Omit<InferRecord<C>, "id">,
  ) => OrderByBuilder<InferRecord<C>>;
}

function mapRecord<C extends CollectionDef<CollectionFields>>(
  record: Record<string, unknown>,
): InferRecord<C> {
  const { _deleted, _updatedAt, _author, ...fields } = record;
  return fields as InferRecord<C>;
}

export type OnWriteCallback = (event: StoredEvent) => Effect.Effect<void, StorageError>;

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

  const commitEvent = (event: StoredEvent): Effect.Effect<void, StorageError> =>
    Effect.gen(function* () {
      yield* storage.putEvent(event);
      yield* applyEvent(storage, event);
      if (onWrite) yield* onWrite(event);
      yield* notifyChange(watchCtx, {
        collection: collectionName,
        recordId: event.recordId,
        kind: event.kind,
      });
    });

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
        yield* commitEvent(event);
        return id;
      }),

    update: (id, data) =>
      Effect.gen(function* () {
        const existing = yield* storage.getRecord(collectionName, id);
        if (!existing || existing._deleted) {
          return yield* new NotFoundError({
            collection: collectionName,
            id,
          });
        }
        yield* partialValidator(data);
        const { _deleted, _updatedAt, _author, ...existingFields } = existing;
        const merged = { ...existingFields, ...data, id };
        yield* validator(merged);

        const event: StoredEvent = {
          id: makeEventId(),
          collection: collectionName,
          recordId: id,
          kind: "update",
          data: merged as Record<string, unknown>,
          createdAt: Date.now(),
        };
        yield* commitEvent(event);
      }),

    delete: (id) =>
      Effect.gen(function* () {
        const existing = yield* storage.getRecord(collectionName, id);
        if (!existing || existing._deleted) {
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
        yield* commitEvent(event);
      }),

    get: (id) =>
      Effect.gen(function* () {
        const record = yield* storage.getRecord(collectionName, id);
        if (!record || record._deleted) {
          return yield* new NotFoundError({
            collection: collectionName,
            id,
          });
        }
        return mapRecord<C>(record);
      }),

    first: () =>
      Effect.map(storage.getAllRecords(collectionName), (all) => {
        const found = all.find((r) => !r._deleted);
        return found ? mapRecord<C>(found) : null;
      }),

    count: () =>
      Effect.map(
        storage.getAllRecords(collectionName),
        (all) => all.filter((r) => !r._deleted).length,
      ),

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

    orderBy: (fieldName) =>
      createOrderByBuilder<InferRecord<C>>(
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
