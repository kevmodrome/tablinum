import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { field } from "../../src/schema/field.ts";
import { collection } from "../../src/schema/collection.ts";

describe("collection builder", () => {
  it.effect("creates a valid collection", () =>
    Effect.gen(function* () {
      const col = yield* collection("todos", {
        title: field.string(),
        done: field.boolean(),
      });
      expect(col._tag).toBe("CollectionDef");
      expect(col.name).toBe("todos");
      expect(Object.keys(col.fields)).toEqual(["title", "done"]);
    }),
  );

  it.effect("rejects empty name", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(collection("", { title: field.string() }));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("rejects empty fields", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(collection("empty", {}));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("rejects reserved field names", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(collection("bad", { id: field.string() }));
      expect(result._tag).toBe("Failure");
    }),
  );
});
