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

export const authorsCollectionDef: CollectionDef = {
  _tag: "CollectionDef",
  name: "_authors",
  fields: {
    name: optionalString,
    picture: optionalString,
    about: optionalString,
    nip05: optionalString,
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
