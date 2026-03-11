import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  createRotation,
  parseRotationEvent,
  parseRemovalNotice,
} from "../../src/db/key-rotation.ts";
import { createEpochKey, createEpochStore, bytesToHex } from "../../src/db/epoch.ts";

describe("key rotation", () => {
  it("creates a rotation with new epoch and wrapped events", () => {
    const epochKey = bytesToHex(generateSecretKey());
    const epoch0 = createEpochKey("epoch-0", epochKey, Date.now(), "creator");
    const store = createEpochStore(epoch0);

    const senderSk = generateSecretKey();
    const senderPk = getPublicKey(senderSk);
    const member2Pk = getPublicKey(generateSecretKey());
    const removedPk = getPublicKey(generateSecretKey());

    const result = createRotation(store, senderSk, senderPk, [senderPk, member2Pk], [removedPk]);

    expect(result.epoch.parentEpoch).toBe("epoch-0");
    expect(result.epoch.createdBy).toBe(senderPk);
    // One wrapped event for member2 (sender doesn't get one)
    expect(result.wrappedEvents).toHaveLength(1);
    expect(result.wrappedEvents[0].kind).toBe(1059);
    // One removal notice for the removed member
    expect(result.removalNotices).toHaveLength(1);
    expect(result.removalNotices[0].kind).toBe(1059);
  });

  it("creates no wrapped events when sender is the only remaining member", () => {
    const epochKey = bytesToHex(generateSecretKey());
    const epoch0 = createEpochKey("epoch-0", epochKey, Date.now(), "creator");
    const store = createEpochStore(epoch0);

    const senderSk = generateSecretKey();
    const senderPk = getPublicKey(senderSk);
    const removedPk = getPublicKey(generateSecretKey());

    const result = createRotation(store, senderSk, senderPk, [senderPk], [removedPk]);

    expect(result.wrappedEvents).toHaveLength(0);
    expect(result.removalNotices).toHaveLength(1);
    expect(result.epoch.parentEpoch).toBe("epoch-0");
  });

  it("new epoch has a unique key different from parent", () => {
    const epochKey = bytesToHex(generateSecretKey());
    const epoch0 = createEpochKey("epoch-0", epochKey, Date.now(), "creator");
    const store = createEpochStore(epoch0);

    const senderSk = generateSecretKey();
    const senderPk = getPublicKey(senderSk);
    const removedPk = getPublicKey(generateSecretKey());

    const result = createRotation(store, senderSk, senderPk, [senderPk], [removedPk]);

    expect(result.epoch.privateKey).not.toBe(epoch0.privateKey);
    expect(result.epoch.publicKey).not.toBe(epoch0.publicKey);
    expect(result.epoch.id).not.toBe(epoch0.id);
  });

  it("parses a rotation event", () => {
    const data = {
      _rotation: true,
      epochId: "e1",
      epochKey: "a".repeat(64),
      parentEpoch: "e0",
      removedMembers: ["pk1"],
    };
    const dTag = "_system:rotation:e1";
    const parsed = parseRotationEvent(JSON.stringify(data), dTag);
    expect(parsed).not.toBeNull();
    expect(parsed!.epochId).toBe("e1");
    expect(parsed!.epochKey).toBe("a".repeat(64));
    expect(parsed!.parentEpoch).toBe("e0");
    expect(parsed!.removedMembers).toEqual(["pk1"]);
  });

  it("rejects non-rotation d-tags", () => {
    const data = JSON.stringify({ _rotation: true, epochId: "e1", epochKey: "a".repeat(64) });
    expect(parseRotationEvent(data, "todos:123")).toBeNull();
    expect(parseRotationEvent(data, "_members:abc")).toBeNull();
  });

  it("rejects non-rotation content", () => {
    expect(parseRotationEvent("{}", "_system:rotation:x")).toBeNull();
    expect(
      parseRotationEvent(JSON.stringify({ _rotation: false }), "_system:rotation:x"),
    ).toBeNull();
    expect(parseRotationEvent("invalid json", "_system:rotation:x")).toBeNull();
  });

  it("rejects rotation with missing fields", () => {
    expect(
      parseRotationEvent(JSON.stringify({ _rotation: true }), "_system:rotation:x"),
    ).toBeNull();
    expect(
      parseRotationEvent(JSON.stringify({ _rotation: true, epochId: "e1" }), "_system:rotation:x"),
    ).toBeNull();
  });

  it("rejects rotation with invalid epoch key payload", () => {
    expect(
      parseRotationEvent(
        JSON.stringify({
          _rotation: true,
          epochId: "e1",
          epochKey: "short",
          parentEpoch: "e0",
          removedMembers: [],
        }),
        "_system:rotation:x",
      ),
    ).toBeNull();
  });

  it("parses a removal notice", () => {
    const data = { _removed: true, epochId: "e1", removedBy: "pk-admin" };
    const parsed = parseRemovalNotice(JSON.stringify(data), "_system:removed:e1");
    expect(parsed).not.toBeNull();
    expect(parsed!.epochId).toBe("e1");
    expect(parsed!.removedBy).toBe("pk-admin");
  });

  it("rejects non-removal d-tags", () => {
    const data = JSON.stringify({ _removed: true, epochId: "e1", removedBy: "pk" });
    expect(parseRemovalNotice(data, "_system:rotation:e1")).toBeNull();
    expect(parseRemovalNotice(data, "todos:123")).toBeNull();
  });

  it("rejects invalid removal content", () => {
    expect(parseRemovalNotice("{}", "_system:removed:x")).toBeNull();
    expect(parseRemovalNotice("bad json", "_system:removed:x")).toBeNull();
    expect(parseRemovalNotice(JSON.stringify({ _removed: true }), "_system:removed:x")).toBeNull();
  });
});
