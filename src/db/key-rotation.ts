import { Option, Schema } from "effect";
import { generateSecretKey } from "nostr-tools/pure";
import { wrapEvent } from "nostr-tools/nip59";
import type { NostrEvent } from "nostr-tools/pure";
import type { EpochKey, EpochStore } from "./epoch.ts";
import { EpochId, createEpochKey, getCurrentEpoch, bytesToHex } from "./epoch.ts";
import { uuidv7 } from "../utils/uuid.ts";

export interface RotationResult {
  readonly epoch: EpochKey;
  readonly wrappedEvents: NostrEvent[];
  readonly removalNotices: NostrEvent[];
}

export interface RotationData {
  readonly _rotation: true;
  readonly epochId: EpochId;
  readonly epochKey: string;
  readonly parentEpoch: EpochId;
  readonly removedMembers: readonly string[];
}

export interface RemovalNotice {
  readonly _removed: true;
  readonly epochId: EpochId;
  readonly removedBy: string;
}

const HexKeySchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/i));

const RotationDataSchema = Schema.Struct({
  _rotation: Schema.Literal(true),
  epochId: Schema.String,
  epochKey: HexKeySchema,
  parentEpoch: Schema.String,
  removedMembers: Schema.Array(Schema.String),
});

const RemovalNoticeSchema = Schema.Struct({
  _removed: Schema.Literal(true),
  epochId: Schema.String,
  removedBy: Schema.String,
});

const decodeRotationData = Schema.decodeUnknownSync(Schema.fromJsonString(RotationDataSchema));
const decodeRemovalNotice = Schema.decodeUnknownSync(Schema.fromJsonString(RemovalNoticeSchema));

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
  const epochId = EpochId(uuidv7());

  const epoch = createEpochKey(epochId, newKeyHex, senderPublicKey, currentEpoch.id);

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
    created_at: Math.floor(Date.now() / 1000),
  };

  const wrappedEvents: NostrEvent[] = [];
  for (const memberPubkey of remainingMemberPubkeys) {
    if (memberPubkey === senderPublicKey) continue;
    const wrapped = wrapEvent(rumor, senderPrivateKey, memberPubkey);
    wrappedEvents.push(wrapped);
  }

  const removalData: RemovalNotice = {
    _removed: true,
    epochId,
    removedBy: senderPublicKey,
  };
  const removalRumor = {
    kind: 1,
    content: JSON.stringify(removalData),
    tags: [["d", `_system:removed:${epochId}`]],
    created_at: Math.floor(Date.now() / 1000),
  };
  const removalNotices: NostrEvent[] = [];
  for (const removedPubkey of removedMemberPubkeys) {
    const wrapped = wrapEvent(removalRumor, senderPrivateKey, removedPubkey);
    removalNotices.push(wrapped);
  }

  return { epoch, wrappedEvents, removalNotices };
}

export function parseRotationEvent(content: string, dTag: string): Option.Option<RotationData> {
  if (!dTag.startsWith("_system:rotation:")) return Option.none();
  try {
    return Option.some(decodeRotationData(content) as unknown as RotationData);
  } catch {
    return Option.none();
  }
}

export function parseRemovalNotice(content: string, dTag: string): Option.Option<RemovalNotice> {
  if (!dTag.startsWith("_system:removed:")) return Option.none();
  try {
    return Option.some(decodeRemovalNotice(content) as unknown as RemovalNotice);
  } catch {
    return Option.none();
  }
}
