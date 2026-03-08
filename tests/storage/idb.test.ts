import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { openIDBStorage } from "../../src/storage/idb.ts";

describe("IDBStorage", () => {
  it.effect("opens and closes without error", () =>
    Effect.gen(function* () {
      const storage = yield* openIDBStorage("test-open");
      expect(storage).toBeDefined();
    }),
  );

  it.effect("puts and gets a record", () =>
    Effect.gen(function* () {
      const storage = yield* openIDBStorage("test-put-get");
      yield* storage.putRecord({
        id: "r1",
        collection: "todos",
        data: { title: "Test" },
        deleted: false,
        updatedAt: 100,
      });
      const record = yield* storage.getRecord("todos", "r1");
      expect(record).toBeDefined();
      expect(record!.data.title).toBe("Test");
    }),
  );

  it.effect("gets all records for a collection", () =>
    Effect.gen(function* () {
      const storage = yield* openIDBStorage("test-get-all");
      yield* storage.putRecord({
        id: "r1",
        collection: "todos",
        data: { title: "A" },
        deleted: false,
        updatedAt: 100,
      });
      yield* storage.putRecord({
        id: "r2",
        collection: "todos",
        data: { title: "B" },
        deleted: false,
        updatedAt: 200,
      });
      yield* storage.putRecord({
        id: "r3",
        collection: "notes",
        data: { text: "C" },
        deleted: false,
        updatedAt: 300,
      });
      const todos = yield* storage.getAllRecords("todos");
      expect(todos.length).toBe(2);
      const notes = yield* storage.getAllRecords("notes");
      expect(notes.length).toBe(1);
    }),
  );

  it.effect("clears records store", () =>
    Effect.gen(function* () {
      const storage = yield* openIDBStorage("test-clear");
      yield* storage.putRecord({
        id: "r1",
        collection: "todos",
        data: {},
        deleted: false,
        updatedAt: 100,
      });
      yield* storage.clearRecords();
      const all = yield* storage.getAllRecords("todos");
      expect(all.length).toBe(0);
    }),
  );

  it.effect("puts and gets events", () =>
    Effect.gen(function* () {
      const storage = yield* openIDBStorage("test-events");
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
      const storage = yield* openIDBStorage("test-events-by-record");
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
      const storage = yield* openIDBStorage("test-giftwraps");
      yield* storage.putGiftWrap({
        id: "gw1",
        event: { kind: 1059 },
        createdAt: 100,
      });
      const gw = yield* storage.getGiftWrap("gw1");
      expect(gw).toBeDefined();
      expect(gw!.event.kind).toBe(1059);
    }),
  );
});
