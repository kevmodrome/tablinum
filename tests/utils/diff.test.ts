import { describe, expect, it } from "vitest";
import { deepDiff, deepMerge } from "../../src/utils/diff.ts";

describe("deepDiff", () => {
  it("returns null for identical objects", () => {
    expect(deepDiff({ a: 1, b: "x" }, { a: 1, b: "x" })).toBeNull();
  });

  it("detects scalar changes", () => {
    expect(deepDiff({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("detects added fields", () => {
    expect(deepDiff({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: 2 });
  });

  it("handles nested objects recursively", () => {
    const before = { meta: { color: "red", size: 10 } };
    const after = { meta: { color: "blue", size: 10 } };
    expect(deepDiff(before, after)).toEqual({ meta: { color: "blue" } });
  });

  it("treats arrays as atomic (compare via stringify)", () => {
    expect(deepDiff({ tags: [1, 2] }, { tags: [1, 2] })).toBeNull();
    expect(deepDiff({ tags: [1, 2] }, { tags: [1, 3] })).toEqual({ tags: [1, 3] });
  });

  it("handles mixed nesting", () => {
    const before = { a: 1, nested: { x: 10, y: 20 }, tags: ["a"] };
    const after = { a: 1, nested: { x: 10, y: 30 }, tags: ["a", "b"] };
    expect(deepDiff(before, after)).toEqual({ nested: { y: 30 }, tags: ["a", "b"] });
  });

  it("returns null when deeply nested objects are equal", () => {
    const obj = { a: { b: { c: 1 } } };
    expect(deepDiff(obj, { ...obj })).toBeNull();
  });
});

describe("deepMerge", () => {
  it("merges shallow fields", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it("merges nested objects recursively", () => {
    const target = { meta: { color: "red", size: 10 } };
    const source = { meta: { color: "blue" } };
    expect(deepMerge(target, source)).toEqual({ meta: { color: "blue", size: 10 } });
  });

  it("replaces arrays (not merging elements)", () => {
    expect(deepMerge({ tags: [1, 2] }, { tags: [3] })).toEqual({ tags: [3] });
  });

  it("preserves non-overlapping fields", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("replaces scalar with object", () => {
    expect(deepMerge({ a: 1 }, { a: { nested: true } })).toEqual({ a: { nested: true } });
  });
});
