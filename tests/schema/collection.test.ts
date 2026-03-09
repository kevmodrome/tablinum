import { describe, expect, it } from "vitest";
import { field } from "../../src/schema/field.ts";
import { collection } from "../../src/schema/collection.ts";

describe("collection builder", () => {
  it("creates a valid collection", () => {
    const col = collection("todos", {
      title: field.string(),
      done: field.boolean(),
    });
    expect(col._tag).toBe("CollectionDef");
    expect(col.name).toBe("todos");
    expect(Object.keys(col.fields)).toEqual(["title", "done"]);
  });

  it("rejects empty name", () => {
    expect(() => collection("", { title: field.string() })).toThrow();
  });

  it("rejects empty fields", () => {
    expect(() => collection("empty", {})).toThrow();
  });

  it("rejects reserved field names", () => {
    expect(() => collection("bad", { id: field.string() })).toThrow();
  });
});
