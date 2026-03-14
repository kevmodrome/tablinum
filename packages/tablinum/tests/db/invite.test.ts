import { describe, expect, it } from "vitest";
import { encodeInvite, decodeInvite, type Invite } from "../../src/db/invite.ts";
import { EpochId, DatabaseName } from "../../src/brands.ts";

describe("invite", () => {
  const validInvite: Invite = {
    epochKeys: [{ epochId: EpochId("epoch-0"), key: "a".repeat(64) }],
    relays: ["wss://relay1.example.com", "wss://relay2.example.com"],
    dbName: DatabaseName("test-db"),
  };

  it("round-trips encode and decode", () => {
    const encoded = encodeInvite(validInvite);
    const decoded = decodeInvite(encoded);
    expect(decoded).toEqual(validInvite);
  });

  it("encoded invite is a base64 string", () => {
    const encoded = encodeInvite(validInvite);
    expect(typeof encoded).toBe("string");
    expect(() => atob(encoded)).not.toThrow();
  });

  it("rejects invalid base64", () => {
    expect(() => decodeInvite("not-valid-base64!!!")).toThrow("Invalid invite");
  });

  it("rejects legacy groupKey invites", () => {
    const bad = btoa(
      JSON.stringify({
        groupKey: "a".repeat(64),
        relays: ["wss://relay.example.com"],
        dbName: "x",
      }),
    );
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("rejects missing epochKeys", () => {
    const bad = btoa(JSON.stringify({ relays: [], dbName: "x" }));
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("rejects epochKeys with invalid key format", () => {
    const bad = btoa(
      JSON.stringify({
        epochKeys: [{ epochId: "e0", key: "short" }],
        relays: [],
        dbName: "x",
      }),
    );
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("rejects missing relays", () => {
    const bad = btoa(
      JSON.stringify({
        epochKeys: [{ epochId: "e0", key: "a".repeat(64) }],
        dbName: "x",
      }),
    );
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("rejects non-string relay entries", () => {
    const bad = btoa(
      JSON.stringify({
        epochKeys: [{ epochId: "e0", key: "a".repeat(64) }],
        relays: [123],
        dbName: "x",
      }),
    );
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("rejects missing dbName", () => {
    const bad = btoa(
      JSON.stringify({
        epochKeys: [{ epochId: "e0", key: "a".repeat(64) }],
        relays: [],
      }),
    );
    expect(() => decodeInvite(bad)).toThrow("unexpected shape");
  });

  it("handles multi-epoch invite", () => {
    const invite: Invite = {
      epochKeys: [
        { epochId: EpochId("e0"), key: "a".repeat(64) },
        { epochId: EpochId("e1"), key: "b".repeat(64) },
      ],
      relays: ["wss://relay.example.com"],
      dbName: DatabaseName("test-db"),
    };
    const encoded = encodeInvite(invite);
    const decoded = decodeInvite(encoded);
    expect(decoded).toEqual(invite);
    expect(decoded.epochKeys).toHaveLength(2);
  });
});
