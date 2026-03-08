import { Effect, Scope } from "effect";
import { openDB, type IDBPDatabase } from "idb";
import { StorageError } from "../errors.ts";
import type { SchemaConfig } from "../schema/types.ts";

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
  // Records — per-collection stores with flat shape
  readonly putRecord: (
    collection: string,
    record: Record<string, unknown>,
  ) => Effect.Effect<void, StorageError>;
  readonly getRecord: (
    collection: string,
    id: string,
  ) => Effect.Effect<Record<string, unknown> | undefined, StorageError>;
  readonly getAllRecords: (
    collection: string,
  ) => Effect.Effect<ReadonlyArray<Record<string, unknown>>, StorageError>;
  readonly countRecords: (collection: string) => Effect.Effect<number, StorageError>;
  readonly clearRecords: (collection: string) => Effect.Effect<void, StorageError>;

  // Index-based queries
  readonly getByIndex: (
    collection: string,
    indexName: string,
    value: IDBValidKey,
  ) => Effect.Effect<ReadonlyArray<Record<string, unknown>>, StorageError>;
  readonly getByIndexRange: (
    collection: string,
    indexName: string,
    range: IDBKeyRange,
  ) => Effect.Effect<ReadonlyArray<Record<string, unknown>>, StorageError>;
  readonly getAllSorted: (
    collection: string,
    indexName: string,
    direction?: "next" | "prev",
  ) => Effect.Effect<ReadonlyArray<Record<string, unknown>>, StorageError>;

  // Events
  readonly putEvent: (event: StoredEvent) => Effect.Effect<void, StorageError>;
  readonly getEvent: (id: string) => Effect.Effect<StoredEvent | undefined, StorageError>;
  readonly getAllEvents: () => Effect.Effect<ReadonlyArray<StoredEvent>, StorageError>;
  readonly getEventsByRecord: (
    collection: string,
    recordId: string,
  ) => Effect.Effect<ReadonlyArray<StoredEvent>, StorageError>;

  // Gift wraps
  readonly putGiftWrap: (gw: StoredGiftWrap) => Effect.Effect<void, StorageError>;
  readonly getGiftWrap: (id: string) => Effect.Effect<StoredGiftWrap | undefined, StorageError>;
  readonly getAllGiftWraps: () => Effect.Effect<ReadonlyArray<StoredGiftWrap>, StorageError>;

  readonly close: () => Effect.Effect<void>;
}

const DB_NAME = "localstr";

function storeName(collection: string): string {
  return `col_${collection}`;
}

function schemaVersion(schema: SchemaConfig): number {
  const sig = Object.entries(schema)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, def]) => {
      const indices = [...(def.indices ?? [])].sort().join(",");
      return `${name}:${indices}`;
    })
    .join("|");
  let hash = 1;
  for (let i = 0; i < sig.length; i++) {
    hash = (hash * 31 + sig.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) + 1;
}

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
  dbName: string | undefined,
  schema: SchemaConfig,
): Effect.Effect<IDBStorageHandle, StorageError, Scope.Scope> {
  return Effect.gen(function* () {
    const name = dbName ?? DB_NAME;
    const version = schemaVersion(schema);

    const db: IDBPDatabase = yield* Effect.tryPromise({
      try: () =>
        openDB(name, version, {
          upgrade(database) {
            // Create events store if missing
            if (!database.objectStoreNames.contains("events")) {
              const events = database.createObjectStore("events", {
                keyPath: "id",
              });
              events.createIndex("by-record", ["collection", "recordId"]);
            }

            // Create giftwraps store if missing
            if (!database.objectStoreNames.contains("giftwraps")) {
              database.createObjectStore("giftwraps", {
                keyPath: "id",
              });
            }

            // Remove old shared records store if it exists
            if (database.objectStoreNames.contains("records")) {
              database.deleteObjectStore("records");
            }

            // Determine which collection stores should exist
            const expectedStores = new Set<string>();
            for (const [, def] of Object.entries(schema)) {
              const sn = storeName(def.name);
              expectedStores.add(sn);

              if (!database.objectStoreNames.contains(sn)) {
                // Create new collection store
                const store = database.createObjectStore(sn, { keyPath: "id" });
                for (const idx of def.indices ?? []) {
                  store.createIndex(idx, idx);
                }
              } else {
                // Update indices on existing store
                const tx = (database as any).transaction;
                // During upgrade, we can access stores via transaction
                // The idb library handles this through the upgrade callback
                const store = (tx as IDBTransaction).objectStore(sn);
                const existingIndices = new Set(Array.from(store.indexNames));
                const wantedIndices = new Set(def.indices ?? []);

                // Remove stale indices
                for (const idx of existingIndices) {
                  if (!wantedIndices.has(idx)) {
                    store.deleteIndex(idx);
                  }
                }
                // Add new indices
                for (const idx of wantedIndices) {
                  if (!existingIndices.has(idx as string)) {
                    store.createIndex(idx as string, idx as string);
                  }
                }
              }
            }

            // Remove collection stores no longer in schema
            const allStores = Array.from(database.objectStoreNames);
            for (const existing of allStores) {
              if (existing.startsWith("col_") && !expectedStores.has(existing)) {
                database.deleteObjectStore(existing);
              }
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
      putRecord: (collection, record) =>
        wrap("putRecord", () => db.put(storeName(collection), record).then(() => undefined)),

      getRecord: (collection, id) => wrap("getRecord", () => db.get(storeName(collection), id)),

      getAllRecords: (collection) => wrap("getAllRecords", () => db.getAll(storeName(collection))),

      countRecords: (collection) => wrap("countRecords", () => db.count(storeName(collection))),

      clearRecords: (collection) => wrap("clearRecords", () => db.clear(storeName(collection))),

      getByIndex: (collection, indexName, value) =>
        wrap("getByIndex", () => db.getAllFromIndex(storeName(collection), indexName, value)),

      getByIndexRange: (collection, indexName, range) =>
        wrap("getByIndexRange", () => db.getAllFromIndex(storeName(collection), indexName, range)),

      getAllSorted: (collection, indexName, direction) =>
        wrap("getAllSorted", async () => {
          const sn = storeName(collection);
          const tx = db.transaction(sn, "readonly");
          const store = tx.objectStore(sn);
          const index = store.index(indexName);
          const results: Record<string, unknown>[] = [];
          let cursor = await index.openCursor(null, direction ?? "next");
          while (cursor) {
            results.push(cursor.value as Record<string, unknown>);
            cursor = await cursor.continue();
          }
          return results;
        }),

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
