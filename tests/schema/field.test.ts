import { describe, expect, test } from "vitest";
import { field } from "../../src/schema/field.ts";

describe("field builders", () => {
  test("field.string() creates a string field", () => {
    const f = field.string();
    expect(f._tag).toBe("FieldDef");
    expect(f.kind).toBe("string");
    expect(f.isOptional).toBe(false);
    expect(f.isArray).toBe(false);
  });

  test("field.number() creates a number field", () => {
    const f = field.number();
    expect(f.kind).toBe("number");
  });

  test("field.boolean() creates a boolean field", () => {
    const f = field.boolean();
    expect(f.kind).toBe("boolean");
  });

  test("field.json() creates a json field", () => {
    const f = field.json();
    expect(f.kind).toBe("json");
  });

  test("field.optional() wraps a field as optional", () => {
    const f = field.optional(field.string());
    expect(f.kind).toBe("string");
    expect(f.isOptional).toBe(true);
    expect(f.isArray).toBe(false);
  });

  test("field.array() wraps a field as array", () => {
    const f = field.array(field.number());
    expect(f.kind).toBe("number");
    expect(f.isOptional).toBe(false);
    expect(f.isArray).toBe(true);
  });

  test("field.object() creates an object field with nested fields", () => {
    const f = field.object({
      street: field.string(),
      city: field.string(),
    });
    expect(f._tag).toBe("FieldDef");
    expect(f.kind).toBe("object");
    expect(f.isOptional).toBe(false);
    expect(f.isArray).toBe(false);
    expect(f.fields).toBeDefined();
    expect(f.fields!.street.kind).toBe("string");
    expect(f.fields!.city.kind).toBe("string");
  });

  test("field.object() nests recursively", () => {
    const f = field.object({
      name: field.string(),
      geo: field.object({
        lat: field.number(),
        lng: field.number(),
      }),
    });
    expect(f.kind).toBe("object");
    expect(f.fields!.geo.kind).toBe("object");
    expect(f.fields!.geo.fields!.lat.kind).toBe("number");
  });

  test("field.optional(field.object()) works", () => {
    const f = field.optional(field.object({
      x: field.number(),
    }));
    expect(f.kind).toBe("object");
    expect(f.isOptional).toBe(true);
    expect(f.fields!.x.kind).toBe("number");
  });

  test("field.array(field.object()) works", () => {
    const f = field.array(field.object({
      tag: field.string(),
    }));
    expect(f.kind).toBe("object");
    expect(f.isArray).toBe(true);
    expect(f.fields!.tag.kind).toBe("string");
  });
});
