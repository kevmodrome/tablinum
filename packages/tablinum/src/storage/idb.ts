import { Effect, Scope } from "effect";
import { openDB, type IDBPDatabase } from "idb";
import type { NostrEvent } from "nostr-tools/pure";
import { StorageError } from "../errors.ts";
import type { SchemaConfig } from "../schema/types.ts";
import type { DatabaseName } from "../brands.ts";

export interface StoredEvent {
  readonly id: string;
  readonly collection: string;
  readonly recordId: string;
  readonly kind: "c" | "u" | "d";
  readonly data: Record<string, unknown> | null;
  readonly createdAt: number;
  readonly author?: string | undefined;
}

export interface StoredGiftWrap {
  readonly id: string;
  readonly eventId?: string;
  readonly event?: NostrEvent;
  readonly createdAt: number;
}

export interface IDBStorageHandle {
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
  readonly deleteGiftWrap: (id: string) => Effect.Effect<void, StorageError>;
  readonly stripGiftWrapBlob: (id: string) => Effect.Effect<void, StorageError>;

  readonly deleteEvent: (id: string) => Effect.Effect<void, StorageError>;
  readonly stripEventData: (id: string) => Effect.Effect<void, StorageError>;

  readonly getMeta: (key: string) => Effect.Effect<unknown | undefined, StorageError>;
  readonly putMeta: (key: string, value: unknown) => Effect.Effect<void, StorageError>;

  readonly close: () => Effect.Effect<void>;
}

const DB_NAME = "tablinum";

function storeName(collection: string): string {
  return `col_${collection}`;
}

function computeSchemaSig(schema: SchemaConfig): string {
  return Object.entries(schema)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, def]) => {
      const indices = [...(def.indices ?? [])].sort().join(",");
      return `${name}:${indices}`;
    })
    .join("|");
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

function upgradeSchema(database: IDBPDatabase, schema: SchemaConfig, tx: IDBTransaction): void {
  if (!database.objectStoreNames.contains("_meta")) {
    database.createObjectStore("_meta");
  }

  if (!database.objectStoreNames.contains("events")) {
    const events = database.createObjectStore("events", { keyPath: "id" });
    events.createIndex("by-record", ["collection", "recordId"]);
  }

  if (!database.objectStoreNames.contains("giftwraps")) {
    database.createObjectStore("giftwraps", { keyPath: "id" });
  }

  const expectedStores = new Set<string>();
  for (const [, def] of Object.entries(schema)) {
    const sn = storeName(def.name);
    expectedStores.add(sn);

    if (!database.objectStoreNames.contains(sn)) {
      const store = database.createObjectStore(sn, { keyPath: "id" });
      for (const idx of def.indices ?? []) {
        store.createIndex(idx, idx);
      }
    } else {
      const store = tx.objectStore(sn);
      const existingIndices = new Set(Array.from(store.indexNames));
      const wantedIndices = new Set(def.indices ?? []);
      for (const idx of existingIndices) {
        if (!wantedIndices.has(idx)) store.deleteIndex(idx);
      }
      for (const idx of wantedIndices) {
        if (!existingIndices.has(idx as string)) store.createIndex(idx as string, idx as string);
      }
    }
  }

  for (const existing of Array.from(database.objectStoreNames)) {
    if (existing.startsWith("col_") && !expectedStores.has(existing)) {
      database.deleteObjectStore(existing);
    }
  }

  tx.objectStore("_meta").put(computeSchemaSig(schema), "schema_sig");
}

export function openIDBStorage(
  dbName: DatabaseName,
  schema: SchemaConfig,
): Effect.Effect<IDBStorageHandle, StorageError, Scope.Scope> {
  return Effect.gen(function* () {
    const name = dbName ?? DB_NAME;
    const schemaSig = computeSchemaSig(schema);

    if (typeof indexedDB === "undefined") {
      return yield* Effect.fail(
        new StorageError({
          message: "IndexedDB is not available in this environment",
        }),
      );
    }

    const probeDb: IDBPDatabase = yield* Effect.tryPromise({
      try: () => openDB(name),
      catch: (e) => new StorageError({ message: "Failed to open IndexedDB", cause: e }),
    });

    const currentVersion = probeDb.version;
    let needsUpgrade = true;

    if (probeDb.objectStoreNames.contains("_meta")) {
      const storedSig = yield* Effect.tryPromise({
        try: () => probeDb.get("_meta", "schema_sig"),
        catch: () => new StorageError({ message: "Failed to read schema meta" }),
      }).pipe(Effect.catch(() => Effect.succeed(undefined)));
      needsUpgrade = storedSig !== schemaSig;
    }

    probeDb.close();

    const db: IDBPDatabase = needsUpgrade
      ? yield* Effect.tryPromise({
          try: () =>
            openDB(name, currentVersion + 1, {
              upgrade(database, _oldVersion, _newVersion, transaction) {
                upgradeSchema(database, schema, transaction as unknown as IDBTransaction);
              },
            }),
          catch: (e) => new StorageError({ message: "Failed to open IndexedDB", cause: e }),
        })
      : yield* Effect.tryPromise({
          try: () => openDB(name),
          catch: (e) => new StorageError({ message: "Failed to open IndexedDB", cause: e }),
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

      deleteGiftWrap: (id) =>
        wrap("deleteGiftWrap", () => db.delete("giftwraps", id).then(() => undefined)),

      stripGiftWrapBlob: (id) =>
        wrap("stripGiftWrapBlob", async () => {
          const existing = await db.get("giftwraps", id);
          if (existing) {
            await db.put("giftwraps", { id: existing.id, createdAt: existing.createdAt });
          }
        }),

      deleteEvent: (id) => wrap("deleteEvent", () => db.delete("events", id).then(() => undefined)),

      stripEventData: (id) =>
        wrap("stripEventData", async () => {
          const existing = await db.get("events", id);
          if (existing) {
            await db.put("events", { ...existing, data: null });
          }
        }),

      getMeta: (key) => wrap("getMeta", () => db.get("_meta", key)),

      putMeta: (key, value) =>
        wrap("putMeta", () => db.put("_meta", value, key).then(() => undefined)),

      close: () => Effect.sync(() => db.close()),
    };

    return handle;
  });
}
