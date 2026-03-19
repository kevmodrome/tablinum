import { describe, test, expectTypeOf } from "vitest";
import { collection } from "../../src/schema/collection.ts";
import { field } from "../../src/schema/field.ts";
import type { InferRecord } from "../../src/schema/types.ts";

describe("InferRecord type inference", () => {
  test("required fields produce required keys", () => {
    const def = collection("todos", {
      title: field.string(),
      done: field.boolean(),
      priority: field.number(),
    });
    type R = InferRecord<typeof def>;

    expectTypeOf<R>().toHaveProperty("id");
    expectTypeOf<R["id"]>().toBeString();
    expectTypeOf<R["title"]>().toBeString();
    expectTypeOf<R["done"]>().toBeBoolean();
    expectTypeOf<R["priority"]>().toBeNumber();
  });

  test("optional fields produce optional keys", () => {
    const def = collection("notes", {
      text: field.string(),
      tag: field.optional(field.string()),
    });
    type R = InferRecord<typeof def>;

    expectTypeOf<R["text"]>().toBeString();

    // A record without the optional 'tag' key should be assignable
    expectTypeOf<{ readonly id: string; readonly text: string }>().toMatchTypeOf<R>();
  });

  test("optional fields in nested objects produce optional keys", () => {
    const def = collection("contacts", {
      name: field.string(),
      address: field.object({
        street: field.string(),
        zip: field.optional(field.string()),
      }),
    });
    type R = InferRecord<typeof def>;

    // address without zip should be assignable
    expectTypeOf<R["address"]>().toMatchTypeOf<{ readonly street: string }>();
  });

  test("array fields remain required", () => {
    const def = collection("lists", {
      items: field.array(field.string()),
    });
    type R = InferRecord<typeof def>;

    expectTypeOf<R["items"]>().toEqualTypeOf<ReadonlyArray<string>>();
  });

  test("optional array fields produce optional keys", () => {
    const def = collection("lists", {
      name: field.string(),
      tags: field.optional(field.array(field.string())),
    });
    type R = InferRecord<typeof def>;

    // A record without the optional 'tags' key should be assignable
    expectTypeOf<{ readonly id: string; readonly name: string }>().toMatchTypeOf<R>();
  });
});
