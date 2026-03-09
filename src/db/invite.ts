export interface Invite {
  readonly groupKey: string; // hex-encoded group private key
  readonly relays: string[];
  readonly dbName: string;
}

export function encodeInvite(invite: Invite): string {
  return btoa(JSON.stringify(invite));
}

export function decodeInvite(encoded: string): Invite {
  let raw: unknown;
  try {
    raw = JSON.parse(atob(encoded));
  } catch {
    throw new Error("Invalid invite: failed to decode");
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as Record<string, unknown>).groupKey !== "string" ||
    !Array.isArray((raw as Record<string, unknown>).relays) ||
    !(raw as Record<string, unknown[]>).relays.every((r: unknown) => typeof r === "string") ||
    typeof (raw as Record<string, unknown>).dbName !== "string"
  ) {
    throw new Error("Invalid invite: unexpected shape");
  }
  const { groupKey, relays, dbName } = raw as Invite;
  if (!/^[0-9a-f]{64}$/i.test(groupKey)) {
    throw new Error("Invalid invite: groupKey must be a 64-char hex string");
  }
  return { groupKey, relays, dbName };
}
