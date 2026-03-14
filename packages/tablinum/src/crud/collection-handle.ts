import { Effect, Option, References, Stream } from "effect";
import type { LogLevel } from "effect";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { InferRecord } from "../schema/types.ts";
import type { RecordValidator, PartialValidator } from "../schema/validate.ts";
import type { IDBStorageHandle, StoredEvent } from "../storage/idb.ts";
import { applyEvent } from "../storage/records-store.ts";
import { deepDiff, deepMerge } from "../utils/diff.ts";
import { NotFoundError, StorageError, ValidationError } from "../errors.ts";
import { uuidv7 } from "../utils/uuid.ts";
import type { WatchContext } from "./watch.ts";
import { notifyChange, watchCollection } from "./watch.ts";
import type { WhereClause, QueryBuilder } from "./query-builder.ts";
import { createWhereClause, createOrderByBuilder } from "./query-builder.ts";

const KIND_FULL = { c: "create", u: "update", d: "delete" } as const;

function sortChronologically(events: ReadonlyArray<StoredEvent>): StoredEvent[] {
  return [...events].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

function replayState(
  recordId: string,
  events: ReadonlyArray<StoredEvent>,
  stopAtId?: string,
): Record<string, unknown> | null {
  let state: Record<string, unknown> | null = null;

  for (const e of events) {
    if (e.kind === "d") {
      state = null;
    } else if (e.data !== null) {
      if (state === null) {
        // The oldest retained event may already be a promoted snapshot.
        state = { id: recordId, ...e.data };
      } else {
        state = deepMerge(state, e.data);
      }
    }

    if (stopAtId !== undefined && e.id === stopAtId) {
      break;
    }
  }

  return state;
}

function promoteToSnapshot(
  storage: IDBStorageHandle,
  collection: string,
  recordId: string,
  target: StoredEvent,
  allSorted: ReadonlyArray<StoredEvent>,
): Effect.Effect<void, StorageError> {
  return Effect.gen(function* () {
    const chronological = sortChronologically(allSorted);
    const state = replayState(recordId, chronological, target.id);

    if (state) {
      yield* storage.putEvent({ ...target, data: state });
    }
  });
}

export function pruneEvents(
  storage: IDBStorageHandle,
  collection: string,
  recordId: string,
  retention: number,
): Effect.Effect<void, StorageError> {
  return Effect.gen(function* () {
    const events = yield* storage.getEventsByRecord(collection, recordId);
    if (events.length <= retention) return;

    const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
    const retained = sorted.slice(0, retention);
    const toStrip = sorted.slice(retention);

    const oldestRetained = retained[retained.length - 1];
    if (retention > 0 && oldestRetained?.kind === "u" && oldestRetained.data !== null) {
      yield* promoteToSnapshot(storage, collection, recordId, oldestRetained, sorted);
    }

    for (const e of toStrip) {
      if (e.data !== null) yield* storage.stripEventData(e.id);
    }
  });
}

export interface CollectionHandle<C extends CollectionDef<CollectionFields>> {
  readonly add: (
    data: Omit<InferRecord<C>, "id">,
  ) => Effect.Effect<string, ValidationError | StorageError>;
  readonly update: (
    id: string,
    data: Partial<Omit<InferRecord<C>, "id">>,
  ) => Effect.Effect<void, ValidationError | StorageError | NotFoundError>;
  readonly delete: (id: string) => Effect.Effect<void, StorageError | NotFoundError>;
  readonly undo: (id: string) => Effect.Effect<void, StorageError | NotFoundError>;
  readonly get: (id: string) => Effect.Effect<InferRecord<C>, StorageError | NotFoundError>;
  readonly first: () => Effect.Effect<Option.Option<InferRecord<C>>, StorageError>;
  readonly count: () => Effect.Effect<number, StorageError>;
  readonly watch: () => Stream.Stream<ReadonlyArray<InferRecord<C>>, StorageError>;
  readonly where: (field: string & keyof Omit<InferRecord<C>, "id">) => WhereClause<InferRecord<C>>;
  readonly orderBy: (
    field: string & keyof Omit<InferRecord<C>, "id">,
  ) => QueryBuilder<InferRecord<C>>;
}

function mapRecord<C extends CollectionDef<CollectionFields>>(
  record: Record<string, unknown>,
): InferRecord<C> {
  const { _d, _u, _a, _e, ...fields } = record;
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
  localAuthor?: string,
  onWrite?: OnWriteCallback,
  logLevel: LogLevel.LogLevel = "None",
): CollectionHandle<C> {
  const collectionName = def.name;
  const withLog = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
    Effect.provideService(effect, References.MinimumLogLevel, logLevel);

  const commitEvent = (event: StoredEvent): Effect.Effect<void, StorageError> =>
    Effect.gen(function* () {
      yield* storage.putEvent(event);
      yield* applyEvent(storage, event);
      if (onWrite) yield* onWrite(event);
      yield* notifyChange(watchCtx, {
        collection: collectionName,
        recordId: event.recordId,
        kind: KIND_FULL[event.kind],
      });
    });

  const handle: CollectionHandle<C> = {
    add: (data) =>
      withLog(
        Effect.gen(function* () {
          const id = uuidv7();
          const fullRecord = { id, ...data };
          yield* validator(fullRecord);

          const event: StoredEvent = {
            id: makeEventId(),
            collection: collectionName,
            recordId: id,
            kind: "c",
            data: fullRecord as unknown as Record<string, unknown>,
            createdAt: Date.now(),
            author: localAuthor,
          };
          yield* commitEvent(event);
          yield* Effect.logDebug("Record added", {
            collection: collectionName,
            recordId: id,
            data: fullRecord,
          });
          return id;
        }),
      ),

    update: (id, data) =>
      withLog(
        Effect.gen(function* () {
          const existing = yield* storage.getRecord(collectionName, id);
          if (!existing || existing._d) {
            return yield* new NotFoundError({
              collection: collectionName,
              id,
            });
          }
          yield* partialValidator(data);
          const { _d, _u, _a, _e, ...existingFields } = existing;
          const merged = { ...existingFields, ...data, id };
          yield* validator(merged);

          const diff = deepDiff(existingFields, merged as Record<string, unknown>);
          const event: StoredEvent = {
            id: makeEventId(),
            collection: collectionName,
            recordId: id,
            kind: "u",
            data: diff ?? { id },
            createdAt: Date.now(),
            author: localAuthor,
          };
          yield* commitEvent(event);
          yield* Effect.logDebug("Record updated", {
            collection: collectionName,
            recordId: id,
            data: diff,
          });

          yield* pruneEvents(storage, collectionName, id, def.eventRetention);
        }),
      ),

    delete: (id) =>
      withLog(
        Effect.gen(function* () {
          const existing = yield* storage.getRecord(collectionName, id);
          if (!existing || existing._d) {
            return yield* new NotFoundError({
              collection: collectionName,
              id,
            });
          }

          const event: StoredEvent = {
            id: makeEventId(),
            collection: collectionName,
            recordId: id,
            kind: "d",
            data: null,
            createdAt: Date.now(),
            author: localAuthor,
          };
          yield* commitEvent(event);
          yield* Effect.logDebug("Record deleted", { collection: collectionName, recordId: id });

          yield* pruneEvents(storage, collectionName, id, def.eventRetention);
        }),
      ),

    undo: (id) =>
      Effect.gen(function* () {
        const existing = yield* storage.getRecord(collectionName, id);
        if (!existing) {
          return yield* new NotFoundError({ collection: collectionName, id });
        }

        const events = sortChronologically(yield* storage.getEventsByRecord(collectionName, id));
        if (events.length < 2) {
          return yield* new NotFoundError({ collection: collectionName, id });
        }

        const state = replayState(id, events.slice(0, -1));
        if (!state) {
          return yield* new NotFoundError({ collection: collectionName, id });
        }

        const event: StoredEvent = {
          id: makeEventId(),
          collection: collectionName,
          recordId: id,
          kind: "u",
          data: state,
          createdAt: Date.now(),
          author: localAuthor,
        };
        yield* commitEvent(event);

        yield* pruneEvents(storage, collectionName, id, def.eventRetention);
      }),

    get: (id) =>
      Effect.gen(function* () {
        const record = yield* storage.getRecord(collectionName, id);
        if (!record || record._d) {
          return yield* new NotFoundError({
            collection: collectionName,
            id,
          });
        }
        return mapRecord<C>(record);
      }),

    first: () =>
      Effect.map(storage.getAllRecords(collectionName), (all) => {
        const found = all.find((r) => !r._d);
        return found ? Option.some(mapRecord<C>(found)) : Option.none();
      }),

    count: () =>
      Effect.map(storage.getAllRecords(collectionName), (all) => all.filter((r) => !r._d).length),

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
