import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { field } from "../../src/schema/field.ts";
import { collection } from "../../src/schema/collection.ts";
import { createLocalstr } from "../../src/db/create-localstr.ts";

describe("createLocalstr", () => {
  it.effect("creates a database and performs CRUD", () =>
    Effect.gen(function* () {
      const todos = yield* collection("todos", {
        title: field.string(),
        done: field.boolean(),
      });

      const db = yield* createLocalstr({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-crud",
      });

      const col = db.collection("todos");

      // Add
      const id = yield* col.add({
        title: "Buy milk",
        done: false,
      } as any);
      expect(id).toBeDefined();
      expect(id.length).toBeGreaterThan(0);

      // Get
      const record = yield* col.get(id);
      expect(record.id).toBe(id);
      expect(record.title).toBe("Buy milk");
      expect(record.done).toBe(false);

      // Update
      yield* col.update(id, { done: true } as any);
      const updated = yield* col.get(id);
      expect(updated.done).toBe(true);
      expect(updated.title).toBe("Buy milk");

      // Count
      const count = yield* col.count();
      expect(count).toBe(1);

      // First
      const first = yield* col.first();
      expect(first).not.toBeNull();
      expect(first!.id).toBe(id);

      // Delete
      yield* col.delete(id);
      const countAfter = yield* col.count();
      expect(countAfter).toBe(0);

      // Get after delete returns NotFoundError
      const getResult = yield* Effect.result(col.get(id));
      expect(getResult._tag).toBe("Failure");
    }),
  );

  it.effect("rejects missing relays", () =>
    Effect.gen(function* () {
      const todos = yield* collection("todos", {
        title: field.string(),
      });
      const result = yield* Effect.result(
        createLocalstr({
          schema: { todos },
          relays: [],
          dbName: "test-no-relays",
        }),
      );
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("exports key", () =>
    Effect.gen(function* () {
      const todos = yield* collection("todos", {
        title: field.string(),
      });
      const db = yield* createLocalstr({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-key",
      });
      const key = db.exportKey();
      expect(key).toBeDefined();
      expect(key.length).toBe(64);
    }),
  );

  it.effect("rebuild regenerates records from events", () =>
    Effect.gen(function* () {
      const todos = yield* collection("todos", {
        title: field.string(),
        done: field.boolean(),
      });

      const db = yield* createLocalstr({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-rebuild",
      });

      const col = db.collection("todos");
      const id = yield* col.add({
        title: "Rebuild test",
        done: false,
      } as any);

      yield* col.update(id, { done: true } as any);

      yield* db.rebuild();

      const record = yield* col.get(id);
      expect(record.title).toBe("Rebuild test");
      expect(record.done).toBe(true);
    }),
  );

  it.effect("getSyncStatus returns idle", () =>
    Effect.gen(function* () {
      const todos = yield* collection("todos", {
        title: field.string(),
      });
      const db = yield* createLocalstr({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-status",
      });
      const status = yield* db.getSyncStatus();
      expect(status).toBe("idle");
    }),
  );

  it.effect("where().equals() filters records", () =>
    Effect.gen(function* () {
      const todos = yield* collection("todos", {
        title: field.string(),
        done: field.boolean(),
      });

      const db = yield* createLocalstr({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-where",
      });

      const col = db.collection("todos");
      yield* col.add({ title: "A", done: false } as any);
      yield* col.add({ title: "B", done: true } as any);
      yield* col.add({ title: "C", done: false } as any);

      const where = col.where("done");
      const doneItems = yield* where.equals(true).get();
      expect(doneItems.length).toBe(1);
      expect(doneItems[0]!.title).toBe("B");

      const notDoneItems = yield* where.equals(false).get();
      expect(notDoneItems.length).toBe(2);

      const count = yield* where.equals(true).count();
      expect(count).toBe(1);

      const first = yield* where.equals(true).first();
      expect(first).not.toBeNull();
      expect(first!.title).toBe("B");
    }),
  );
});
