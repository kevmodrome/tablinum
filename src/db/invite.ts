import { Schema } from "effect";
import { EpochKeyInputSchema, type EpochKeyInput } from "./epoch.ts";

export interface Invite {
  readonly epochKeys: Array<EpochKeyInput>;
  readonly relays: string[];
  readonly dbName: string;
}

const InviteSchema = Schema.Struct({
  epochKeys: Schema.Array(EpochKeyInputSchema),
  relays: Schema.Array(Schema.String),
  dbName: Schema.String,
});

const decodeInviteJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);
const decodeInvitePayload = Schema.decodeUnknownSync(InviteSchema);

export function encodeInvite(invite: Invite): string {
  return btoa(JSON.stringify(invite));
}

export function decodeInvite(encoded: string): Invite {
  let raw: unknown;
  try {
    raw = decodeInviteJson(atob(encoded));
  } catch {
    throw new Error("Invalid invite: failed to decode");
  }

  try {
    const invite = decodeInvitePayload(raw);
    return {
      epochKeys: invite.epochKeys.map((epoch) => ({
        epochId: epoch.epochId,
        key: epoch.key,
      })),
      relays: [...invite.relays],
      dbName: invite.dbName,
    };
  } catch {
    throw new Error("Invalid invite: unexpected shape");
  }
}
