import { generateSecretKey } from "nostr-tools/pure";
import { wrapEvent } from "nostr-tools/nip59";
import type { NostrEvent } from "nostr-tools/pure";
import type { EpochKey, EpochStore } from "./epoch.ts";
import { createEpochKey, getCurrentEpoch, bytesToHex } from "./epoch.ts";
import { uuidv7 } from "../utils/uuid.ts";

export interface RotationResult {
  readonly epoch: EpochKey;
  readonly wrappedEvents: NostrEvent[];
  readonly removalNotices: NostrEvent[];
}

export interface RotationData {
  readonly _rotation: true;
  readonly epochId: string;
  readonly epochKey: string;
  readonly parentEpoch: string;
  readonly removedMembers: string[];
}

export interface RemovalNotice {
  readonly _removed: true;
  readonly epochId: string;
  readonly removedBy: string;
}

export function createRotation(
  epochStore: EpochStore,
  senderPrivateKey: Uint8Array,
  senderPublicKey: string,
  remainingMemberPubkeys: string[],
  removedMemberPubkeys: string[],
): RotationResult {
  const newSk = generateSecretKey();
  const newKeyHex = bytesToHex(newSk);
  const currentEpoch = getCurrentEpoch(epochStore);
  const epochId = uuidv7();
  const now = Date.now();

  const epoch = createEpochKey(epochId, newKeyHex, now, senderPublicKey, currentEpoch.id);

  const rotationData: RotationData = {
    _rotation: true,
    epochId,
    epochKey: newKeyHex,
    parentEpoch: currentEpoch.id,
    removedMembers: removedMemberPubkeys,
  };

  const rumor = {
    kind: 1,
    content: JSON.stringify(rotationData),
    tags: [["d", `_system:rotation:${epochId}`]],
    created_at: Math.floor(now / 1000),
  };

  // Wrap individually to each remaining member's personal pubkey
  const wrappedEvents: NostrEvent[] = [];
  for (const memberPubkey of remainingMemberPubkeys) {
    if (memberPubkey === senderPublicKey) continue;
    const wrapped = wrapEvent(rumor, senderPrivateKey, memberPubkey);
    wrappedEvents.push(wrapped);
  }

  // Send removal notices to removed members
  const removalData: RemovalNotice = {
    _removed: true,
    epochId,
    removedBy: senderPublicKey,
  };
  const removalRumor = {
    kind: 1,
    content: JSON.stringify(removalData),
    tags: [["d", `_system:removed:${epochId}`]],
    created_at: Math.floor(now / 1000),
  };
  const removalNotices: NostrEvent[] = [];
  for (const removedPubkey of removedMemberPubkeys) {
    const wrapped = wrapEvent(removalRumor, senderPrivateKey, removedPubkey);
    removalNotices.push(wrapped);
  }

  return { epoch, wrappedEvents, removalNotices };
}

export function parseRotationEvent(content: string, dTag: string): RotationData | null {
  if (!dTag.startsWith("_system:rotation:")) return null;
  try {
    const data = JSON.parse(content);
    if (data._rotation !== true) return null;
    if (typeof data.epochId !== "string" || typeof data.epochKey !== "string") return null;
    return data as RotationData;
  } catch {
    return null;
  }
}

export function parseRemovalNotice(content: string, dTag: string): RemovalNotice | null {
  if (!dTag.startsWith("_system:removed:")) return null;
  try {
    const data = JSON.parse(content);
    if (data._removed !== true) return null;
    if (typeof data.epochId !== "string" || typeof data.removedBy !== "string") return null;
    return data as RemovalNotice;
  } catch {
    return null;
  }
}
