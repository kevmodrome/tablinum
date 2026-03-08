import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { field } from "../../src/schema/field.ts";
import { collection } from "../../src/schema/collection.ts";
import { buildValidator, buildPartialValidator } from "../../src/schema/validate.ts";

describe("schema validation", () => {
  it.effect("validates a correct record", () =>
    Effect.gen(function* () {
      const def = yield* collection("todos", {
        title: field.string(),
        done: field.boolean(),
      });
      const validate = buildValidator("todos", def);
      const result = yield* validate({
        id: "abc",
        title: "Test",
        done: false,
      });
      expect(result).toEqual({ id: "abc", title: "Test", done: false });
    }),
  );

  it.effect("rejects invalid types", () =>
    Effect.gen(function* () {
      const def = yield* collection("todos", {
        title: field.string(),
      });
      const validate = buildValidator("todos", def);
      const result = yield* Effect.result(validate({ id: "abc", title: 42 }));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("handles optional fields", () =>
    Effect.gen(function* () {
      const def = yield* collection("notes", {
        text: field.string(),
        tag: field.optional(field.string()),
      });
      const validate = buildValidator("notes", def);
      const result = yield* validate({
        id: "abc",
        text: "hello",
        tag: undefined,
      });
      expect(result).toEqual({ id: "abc", text: "hello", tag: undefined });
    }),
  );

  it.effect("validates array fields", () =>
    Effect.gen(function* () {
      const def = yield* collection("lists", {
        items: field.array(field.string()),
      });
      const validate = buildValidator("lists", def);
      const result = yield* validate({ id: "abc", items: ["a", "b"] });
      expect(result).toEqual({ id: "abc", items: ["a", "b"] });
    }),
  );

  it.effect("partial validator accepts subset of fields", () =>
    Effect.gen(function* () {
      const def = yield* collection("todos", {
        title: field.string(),
        done: field.boolean(),
      });
      const validate = buildPartialValidator("todos", def);
      const result = yield* validate({ title: "Updated" });
      expect(result).toEqual({ title: "Updated" });
    }),
  );

  it.effect("partial validator rejects unknown fields", () =>
    Effect.gen(function* () {
      const def = yield* collection("todos", {
        title: field.string(),
      });
      const validate = buildPartialValidator("todos", def);
      const result = yield* Effect.result(validate({ unknown: "value" }));
      expect(result._tag).toBe("Failure");
    }),
  );
});
