import { describe, it, expect, vi } from "vitest";
import { Effect } from "effect";
import { createTablinum } from "../src/db/create-tablinum.ts";
import { field } from "../src/schema/field.ts";
import { collection } from "../src/schema/collection.ts";

const schema = {
  todos: collection("todos", { title: field.string() }),
};

describe("logging", () => {
  it("produces no output when logLevel is none (default)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* createTablinum({
              schema,
              relays: ["wss://relay.example.com"],
            });
            yield* db.collection("todos").add({ title: "test" });
            yield* db.close();
          }),
        ),
      );
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("produces output when logLevel is debug", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* createTablinum({
              schema,
              relays: ["wss://relay.example.com"],
              logLevel: "debug",
            });
            yield* db.collection("todos").add({ title: "test" });
            yield* db.close();
          }),
        ),
      );
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((l) => l.includes("Storage opened"))).toBe(true);
      expect(logs.some((l) => l.includes("Identity loaded"))).toBe(true);
      expect(logs.some((l) => l.includes("Tablinum ready"))).toBe(true);
      expect(logs.some((l) => l.includes("Record added"))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("shows only info and above when logLevel is info", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* createTablinum({
              schema,
              relays: ["wss://relay.example.com"],
              logLevel: "info",
            });
            yield* db.collection("todos").add({ title: "test" });
            yield* db.close();
          }),
        ),
      );
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((l) => l.includes("Tablinum ready"))).toBe(true);
      // Debug-level logs should not appear
      expect(logs.some((l) => l.includes("Record added"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
