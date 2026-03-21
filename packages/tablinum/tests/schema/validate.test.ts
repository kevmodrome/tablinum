import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { field } from "../../src/schema/field.ts";
import { collection } from "../../src/schema/collection.ts";
import { buildValidator, buildPartialValidator } from "../../src/schema/validate.ts";

describe("schema validation", () => {
  it.effect("validates a correct record", () =>
    Effect.gen(function* () {
      const def = collection("todos", {
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
      const def = collection("todos", {
        title: field.string(),
      });
      const validate = buildValidator("todos", def);
      const result = yield* Effect.result(validate({ id: "abc", title: 42 }));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("handles optional fields", () =>
    Effect.gen(function* () {
      const def = collection("notes", {
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

  it.effect("allows omitting optional fields entirely", () =>
    Effect.gen(function* () {
      const def = collection("notes", {
        text: field.string(),
        tag: field.optional(field.string()),
      });
      const validate = buildValidator("notes", def);
      const result = yield* validate({
        id: "abc",
        text: "hello",
      });
      expect(result).toEqual({ id: "abc", text: "hello" });
    }),
  );

  it.effect("validates array fields", () =>
    Effect.gen(function* () {
      const def = collection("lists", {
        items: field.array(field.string()),
      });
      const validate = buildValidator("lists", def);
      const result = yield* validate({ id: "abc", items: ["a", "b"] });
      expect(result).toEqual({ id: "abc", items: ["a", "b"] });
    }),
  );

  it.effect("partial validator accepts subset of fields", () =>
    Effect.gen(function* () {
      const def = collection("todos", {
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
      const def = collection("todos", {
        title: field.string(),
      });
      const validate = buildPartialValidator("todos", def);
      const result = yield* Effect.result(validate({ unknown: "value" }));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("partial validator rejects invalid field types", () =>
    Effect.gen(function* () {
      const def = collection("todos", {
        done: field.boolean(),
      });
      const validate = buildPartialValidator("todos", def);
      const result = yield* Effect.result(validate({ done: "nope" }));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("validates nested object fields", () =>
    Effect.gen(function* () {
      const def = collection("contacts", {
        name: field.string(),
        address: field.object({
          street: field.string(),
          city: field.string(),
        }),
      });
      const validate = buildValidator("contacts", def);
      const result = yield* validate({
        id: "abc",
        name: "Alice",
        address: { street: "123 Main", city: "Springfield" },
      });
      expect(result).toEqual({
        id: "abc",
        name: "Alice",
        address: { street: "123 Main", city: "Springfield" },
      });
    }),
  );

  it.effect("rejects invalid nested object fields", () =>
    Effect.gen(function* () {
      const def = collection("contacts", {
        address: field.object({
          city: field.string(),
        }),
      });
      const validate = buildValidator("contacts", def);
      const result = yield* Effect.result(validate({ id: "abc", address: { city: 42 } }));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("validates deeply nested objects", () =>
    Effect.gen(function* () {
      const def = collection("places", {
        location: field.object({
          geo: field.object({
            lat: field.number(),
            lng: field.number(),
          }),
        }),
      });
      const validate = buildValidator("places", def);
      const result = yield* validate({
        id: "abc",
        location: { geo: { lat: 1.5, lng: 2.5 } },
      });
      expect(result).toEqual({
        id: "abc",
        location: { geo: { lat: 1.5, lng: 2.5 } },
      });
    }),
  );

  it.effect("allows omitting optional fields inside nested objects", () =>
    Effect.gen(function* () {
      const def = collection("contacts", {
        name: field.string(),
        address: field.object({
          street: field.string(),
          zip: field.optional(field.string()),
        }),
      });
      const validate = buildValidator("contacts", def);
      const result = yield* validate({
        id: "abc",
        name: "Alice",
        address: { street: "123 Main" },
      });
      expect(result).toEqual({
        id: "abc",
        name: "Alice",
        address: { street: "123 Main" },
      });
    }),
  );

  it.effect("validates optional nested object fields", () =>
    Effect.gen(function* () {
      const def = collection("contacts", {
        name: field.string(),
        address: field.optional(
          field.object({
            city: field.string(),
          }),
        ),
      });
      const validate = buildValidator("contacts", def);
      const result = yield* validate({
        id: "abc",
        name: "Alice",
        address: undefined,
      });
      expect(result).toEqual({ id: "abc", name: "Alice", address: undefined });
    }),
  );

  it.effect("partial validator works with nested object fields", () =>
    Effect.gen(function* () {
      const def = collection("contacts", {
        name: field.string(),
        address: field.object({
          street: field.string(),
          city: field.string(),
        }),
      });
      const validate = buildPartialValidator("contacts", def);
      const result = yield* validate({
        address: { street: "456 Oak", city: "Portland" },
      });
      expect(result).toEqual({
        address: { street: "456 Oak", city: "Portland" },
      });
    }),
  );
});
