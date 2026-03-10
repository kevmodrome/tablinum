import { Effect } from "effect";
import type { CollectionDef } from "../schema/collection.ts";
import type { RelayHandle } from "../sync/relay.ts";
import { RelayError } from "../errors.ts";

const optionalString = {
  _tag: "FieldDef" as const,
  kind: "string" as const,
  isOptional: true,
  isArray: false,
};

const optionalNumber = {
  _tag: "FieldDef" as const,
  kind: "number" as const,
  isOptional: true,
  isArray: false,
};

const requiredNumber = {
  _tag: "FieldDef" as const,
  kind: "number" as const,
  isOptional: false,
  isArray: false,
};

const requiredString = {
  _tag: "FieldDef" as const,
  kind: "string" as const,
  isOptional: false,
  isArray: false,
};

export interface MemberRecord {
  readonly id: string;
  readonly name?: string;
  readonly picture?: string;
  readonly about?: string;
  readonly nip05?: string;
  readonly addedAt: number;
  readonly addedInEpoch: string;
  readonly removedAt?: number;
  readonly removedInEpoch?: string;
}

export const membersCollectionDef: CollectionDef = {
  _tag: "CollectionDef",
  name: "_members",
  fields: {
    name: optionalString,
    picture: optionalString,
    about: optionalString,
    nip05: optionalString,
    addedAt: requiredNumber,
    addedInEpoch: requiredString,
    removedAt: optionalNumber,
    removedInEpoch: optionalString,
  },
  indices: [],
};

export function fetchAuthorProfile(
  relay: RelayHandle,
  relayUrls: readonly string[],
  pubkey: string,
): Effect.Effect<Record<string, unknown> | null, RelayError> {
  return Effect.gen(function* () {
    for (const url of relayUrls) {
      const result = yield* Effect.result(
        relay.fetchByFilter({ kinds: [0], authors: [pubkey], limit: 1 }, url),
      );
      if (result._tag === "Success" && result.success.length > 0) {
        try {
          return JSON.parse(result.success[0].content);
        } catch {
          return null;
        }
      }
    }
    return null;
  });
}
