import { describe, expect, it } from "vitest";
import { encodeInvite, decodeInvite, type Invite } from "../../src/db/invite.ts";

describe("invite", () => {
  const validInvite: Invite = {
    groupKey: "a".repeat(64),
    relays: ["wss://relay1.example.com", "wss://relay2.example.com"],
    dbName: "test-db",
  };

  it("round-trips encode and decode", () => {
    const encoded = encodeInvite(validInvite);
    const decoded = decodeInvite(encoded);
    expect(decoded).toEqual(validInvite);
  });

  it("encoded invite is a base64 string", () => {
    const encoded = encodeInvite(validInvite);
    expect(typeof encoded).toBe("string");
    // Should not throw when decoded as base64
    expect(() => atob(encoded)).not.toThrow();
  });

  it("rejects invalid base64", () => {
    expect(() => decodeInvite("not-valid-base64!!!")).toThrow("Invalid invite");
  });

  it("rejects missing groupKey", () => {
    const bad = btoa(JSON.stringify({ relays: [], dbName: "x" }));
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("rejects non-hex groupKey", () => {
    const bad = btoa(JSON.stringify({ groupKey: "z".repeat(64), relays: [], dbName: "x" }));
    expect(() => decodeInvite(bad)).toThrow("64-char hex string");
  });

  it("rejects groupKey with wrong length", () => {
    const bad = btoa(JSON.stringify({ groupKey: "aa", relays: [], dbName: "x" }));
    expect(() => decodeInvite(bad)).toThrow("64-char hex string");
  });

  it("rejects missing relays", () => {
    const bad = btoa(JSON.stringify({ groupKey: "a".repeat(64), dbName: "x" }));
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("rejects non-string relay entries", () => {
    const bad = btoa(JSON.stringify({ groupKey: "a".repeat(64), relays: [123], dbName: "x" }));
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("rejects missing dbName", () => {
    const bad = btoa(JSON.stringify({ groupKey: "a".repeat(64), relays: [] }));
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });
});
