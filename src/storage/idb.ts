import { Effect, Scope } from "effect";
import { openDB, type IDBPDatabase } from "idb";
import { StorageError } from "../errors.ts";

export interface StoredRecord {
  readonly id: string;
  readonly collection: string;
  readonly data: Record<string, unknown>;
  readonly deleted: boolean;
  readonly updatedAt: number;
}

export interface StoredEvent {
  readonly id: string;
  readonly collection: string;
  readonly recordId: string;
  readonly kind: "create" | "update" | "delete";
  readonly data: Record<string, unknown> | null;
  readonly createdAt: number;
}

export interface StoredGiftWrap {
  readonly id: string;
  readonly event: Record<string, unknown>;
  readonly createdAt: number;
}

export interface IDBStorageHandle {
  readonly putRecord: (record: StoredRecord) => Effect.Effect<void, StorageError>;
  readonly getRecord: (
    collection: string,
    id: string,
  ) => Effect.Effect<StoredRecord | undefined, StorageError>;
  readonly getAllRecords: (
    collection: string,
  ) => Effect.Effect<ReadonlyArray<StoredRecord>, StorageError>;
  readonly countRecords: (collection: string) => Effect.Effect<number, StorageError>;
  readonly clearRecords: () => Effect.Effect<void, StorageError>;
  readonly putEvent: (event: StoredEvent) => Effect.Effect<void, StorageError>;
  readonly getEvent: (id: string) => Effect.Effect<StoredEvent | undefined, StorageError>;
  readonly getAllEvents: () => Effect.Effect<ReadonlyArray<StoredEvent>, StorageError>;
  readonly getEventsByRecord: (
    collection: string,
    recordId: string,
  ) => Effect.Effect<ReadonlyArray<StoredEvent>, StorageError>;
  readonly putGiftWrap: (gw: StoredGiftWrap) => Effect.Effect<void, StorageError>;
  readonly getGiftWrap: (id: string) => Effect.Effect<StoredGiftWrap | undefined, StorageError>;
  readonly getAllGiftWraps: () => Effect.Effect<ReadonlyArray<StoredGiftWrap>, StorageError>;
  readonly close: () => Effect.Effect<void>;
}

const DB_NAME = "localstr";
const DB_VERSION = 2;

function wrap<T>(label: string, fn: () => Promise<T>): Effect.Effect<T, StorageError> {
  return Effect.tryPromise({
    try: fn,
    catch: (e) =>
      new StorageError({
        message: `IndexedDB ${label} failed: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      }),
  });
}

export function openIDBStorage(
  dbName?: string,
): Effect.Effect<IDBStorageHandle, StorageError, Scope.Scope> {
  return Effect.gen(function* () {
    const name = dbName ?? DB_NAME;
    const db: IDBPDatabase = yield* Effect.tryPromise({
      try: () =>
        openDB(name, DB_VERSION, {
          upgrade(database) {
            if (!database.objectStoreNames.contains("records")) {
              const records = database.createObjectStore("records", {
                keyPath: ["collection", "id"],
              });
              records.createIndex("by-collection", "collection");
            }
            if (!database.objectStoreNames.contains("events")) {
              const events = database.createObjectStore("events", {
                keyPath: "id",
              });
              events.createIndex("by-record", ["collection", "recordId"]);
            }
            if (!database.objectStoreNames.contains("giftwraps")) {
              database.createObjectStore("giftwraps", {
                keyPath: "id",
              });
            }
          },
        }),
      catch: (e) =>
        new StorageError({
          message: "Failed to open IndexedDB",
          cause: e,
        }),
    });

    yield* Effect.addFinalizer(() => Effect.sync(() => db.close()));

    const handle: IDBStorageHandle = {
      putRecord: (record) =>
        wrap("putRecord", () => db.put("records", record).then(() => undefined)),

      getRecord: (collection, id) => wrap("getRecord", () => db.get("records", [collection, id])),

      getAllRecords: (collection) =>
        wrap("getAllRecords", () => db.getAllFromIndex("records", "by-collection", collection)),

      countRecords: (collection) =>
        wrap("countRecords", () => db.countFromIndex("records", "by-collection", collection)),

      clearRecords: () => wrap("clearRecords", () => db.clear("records")),

      putEvent: (event) => wrap("putEvent", () => db.put("events", event).then(() => undefined)),

      getEvent: (id) => wrap("getEvent", () => db.get("events", id)),

      getAllEvents: () => wrap("getAllEvents", () => db.getAll("events")),

      getEventsByRecord: (collection, recordId) =>
        wrap("getEventsByRecord", () =>
          db.getAllFromIndex("events", "by-record", [collection, recordId]),
        ),

      putGiftWrap: (gw) => wrap("putGiftWrap", () => db.put("giftwraps", gw).then(() => undefined)),

      getGiftWrap: (id) => wrap("getGiftWrap", () => db.get("giftwraps", id)),

      getAllGiftWraps: () => wrap("getAllGiftWraps", () => db.getAll("giftwraps")),

      close: () => Effect.sync(() => db.close()),
    };

    return handle;
  });
}
