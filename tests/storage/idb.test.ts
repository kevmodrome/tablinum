import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { openIDBStorage } from "../../src/storage/idb.ts";
import { field } from "../../src/schema/field.ts";
import { collection } from "../../src/schema/collection.ts";
import { DatabaseName } from "../../src/brands.ts";
import type { NostrEvent } from "nostr-tools/pure";

const makeSchema = () => ({
  todos: collection("todos", {
    title: field.string(),
  }),
  notes: collection("notes", {
    text: field.string(),
  }),
});

describe("IDBStorage", () => {
  it.effect("opens and closes without error", () =>
    Effect.gen(function* () {
      const schema = makeSchema();
      const storage = yield* openIDBStorage(DatabaseName("test-open"), schema);
      expect(storage).toBeDefined();
    }),
  );

  it.effect("puts and gets a record", () =>
    Effect.gen(function* () {
      const schema = makeSchema();
      const storage = yield* openIDBStorage(DatabaseName("test-put-get"), schema);
      yield* storage.putRecord("todos", {
        id: "r1",
        title: "Test",
        _deleted: false,
        _updatedAt: 100,
      });
      const record = yield* storage.getRecord("todos", "r1");
      expect(record).toBeDefined();
      expect(record!.title).toBe("Test");
    }),
  );

  it.effect("gets all records for a collection", () =>
    Effect.gen(function* () {
      const schema = makeSchema();
      const storage = yield* openIDBStorage(DatabaseName("test-get-all"), schema);
      yield* storage.putRecord("todos", {
        id: "r1",
        title: "A",
        _deleted: false,
        _updatedAt: 100,
      });
      yield* storage.putRecord("todos", {
        id: "r2",
        title: "B",
        _deleted: false,
        _updatedAt: 200,
      });
      yield* storage.putRecord("notes", {
        id: "r3",
        text: "C",
        _deleted: false,
        _updatedAt: 300,
      });
      const todos = yield* storage.getAllRecords("todos");
      expect(todos.length).toBe(2);
      const notes = yield* storage.getAllRecords("notes");
      expect(notes.length).toBe(1);
    }),
  );

  it.effect("clears records store", () =>
    Effect.gen(function* () {
      const schema = makeSchema();
      const storage = yield* openIDBStorage(DatabaseName("test-clear"), schema);
      yield* storage.putRecord("todos", {
        id: "r1",
        title: "X",
        _deleted: false,
        _updatedAt: 100,
      });
      yield* storage.clearRecords("todos");
      const all = yield* storage.getAllRecords("todos");
      expect(all.length).toBe(0);
    }),
  );

  it.effect("puts and gets events", () =>
    Effect.gen(function* () {
      const schema = makeSchema();
      const storage = yield* openIDBStorage(DatabaseName("test-events"), schema);
      yield* storage.putEvent({
        id: "e1",
        collection: "todos",
        recordId: "r1",
        kind: "create",
        data: { title: "Test" },
        createdAt: 100,
      });
      const event = yield* storage.getEvent("e1");
      expect(event).toBeDefined();
      expect(event!.recordId).toBe("r1");
    }),
  );

  it.effect("gets events by record", () =>
    Effect.gen(function* () {
      const schema = makeSchema();
      const storage = yield* openIDBStorage(DatabaseName("test-events-by-record"), schema);
      yield* storage.putEvent({
        id: "e1",
        collection: "todos",
        recordId: "r1",
        kind: "create",
        data: { title: "V1" },
        createdAt: 100,
      });
      yield* storage.putEvent({
        id: "e2",
        collection: "todos",
        recordId: "r1",
        kind: "update",
        data: { title: "V2" },
        createdAt: 200,
      });
      const events = yield* storage.getEventsByRecord("todos", "r1");
      expect(events.length).toBe(2);
    }),
  );

  it.effect("puts and gets gift wraps", () =>
    Effect.gen(function* () {
      const schema = makeSchema();
      const storage = yield* openIDBStorage(DatabaseName("test-giftwraps"), schema);
      yield* storage.putGiftWrap({
        id: "gw1",
        event: { kind: 1059 } as NostrEvent,
        createdAt: 100,
      });
      const gw = yield* storage.getGiftWrap("gw1");
      expect(gw).toBeDefined();
      expect(gw!.event!.kind).toBe(1059);
    }),
  );
});
