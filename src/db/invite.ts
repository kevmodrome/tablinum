export interface Invite {
  readonly epochKeys: Array<{ readonly epochId: string; readonly key: string }>;
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

  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid invite: unexpected shape");
  }

  const obj = raw as Record<string, unknown>;

  // Backward compat: legacy { groupKey } format → single epoch
  if (typeof obj.groupKey === "string" && !obj.epochKeys) {
    if (!/^[0-9a-f]{64}$/i.test(obj.groupKey)) {
      throw new Error("Invalid invite: groupKey must be a 64-char hex string");
    }
    if (!Array.isArray(obj.relays) || !obj.relays.every((r: unknown) => typeof r === "string")) {
      throw new Error("Invalid invite: unexpected shape");
    }
    if (typeof obj.dbName !== "string") {
      throw new Error("Invalid invite: unexpected shape");
    }
    return {
      epochKeys: [{ epochId: "epoch-0", key: obj.groupKey }],
      relays: obj.relays as string[],
      dbName: obj.dbName,
    };
  }

  // New format: { epochKeys, relays, dbName }
  if (
    !Array.isArray(obj.epochKeys) ||
    !obj.epochKeys.every((e: unknown) => {
      if (typeof e !== "object" || e === null) return false;
      const entry = e as Record<string, unknown>;
      return (
        typeof entry.epochId === "string" &&
        typeof entry.key === "string" &&
        /^[0-9a-f]{64}$/i.test(entry.key)
      );
    }) ||
    !Array.isArray(obj.relays) ||
    !obj.relays.every((r: unknown) => typeof r === "string") ||
    typeof obj.dbName !== "string"
  ) {
    throw new Error("Invalid invite: unexpected shape");
  }

  return {
    epochKeys: (obj.epochKeys as Array<{ epochId: string; key: string }>).map((e) => ({
      epochId: e.epochId,
      key: e.key,
    })),
    relays: obj.relays as string[],
    dbName: obj.dbName,
  };
}
