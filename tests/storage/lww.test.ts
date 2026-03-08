import { describe, expect, test } from "vitest";
import { resolveWinner } from "../../src/storage/lww.ts";

describe("LWW resolution", () => {
  test("incoming wins when no existing", () => {
    const incoming = { id: "b", createdAt: 100 };
    expect(resolveWinner(null, incoming)).toBe(incoming);
  });

  test("newer timestamp wins", () => {
    const existing = { id: "a", createdAt: 100 };
    const incoming = { id: "b", createdAt: 200 };
    expect(resolveWinner(existing, incoming)).toBe(incoming);
  });

  test("older timestamp loses", () => {
    const existing = { id: "a", createdAt: 200 };
    const incoming = { id: "b", createdAt: 100 };
    expect(resolveWinner(existing, incoming)).toBe(existing);
  });

  test("tie broken by lowest event ID", () => {
    const existing = { id: "b", createdAt: 100 };
    const incoming = { id: "a", createdAt: 100 };
    expect(resolveWinner(existing, incoming)).toBe(incoming); // "a" < "b"
  });

  test("tie: existing wins when its ID is lower", () => {
    const existing = { id: "a", createdAt: 100 };
    const incoming = { id: "b", createdAt: 100 };
    expect(resolveWinner(existing, incoming)).toBe(existing); // "a" < "b"
  });
});
