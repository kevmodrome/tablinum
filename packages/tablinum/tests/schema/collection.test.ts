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

  it("allows eventRetention to be zero", () => {
    const col = collection(
      "todos",
      {
        title: field.string(),
      },
      { eventRetention: 0 },
    );
    expect(col.eventRetention).toBe(0);
  });

  it("rejects indexing an object field", () => {
    expect(() =>
      collection(
        "contacts",
        {
          name: field.string(),
          address: field.object({
            city: field.string(),
          }),
        },
        { indices: ["address"] as any },
      ),
    ).toThrow();
  });

  it("allows collections with object fields", () => {
    const col = collection("contacts", {
      name: field.string(),
      address: field.object({
        street: field.string(),
        city: field.string(),
      }),
    });
    expect(col.fields.address.kind).toBe("object");
  });
});
