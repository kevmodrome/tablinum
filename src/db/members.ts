import { Effect, Schema } from "effect";
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

export interface AuthorProfile {
  readonly name?: string;
  readonly picture?: string;
  readonly about?: string;
  readonly nip05?: string;
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

const AuthorProfileSchema = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  picture: Schema.optionalKey(Schema.String),
  about: Schema.optionalKey(Schema.String),
  nip05: Schema.optionalKey(Schema.String),
});

const decodeAuthorProfile = Schema.decodeUnknownEffect(Schema.fromJsonString(AuthorProfileSchema));

export function fetchAuthorProfile(
  relay: RelayHandle,
  relayUrls: readonly string[],
  pubkey: string,
): Effect.Effect<AuthorProfile | null, RelayError> {
  return Effect.gen(function* () {
    for (const url of relayUrls) {
      const result = yield* Effect.result(
        relay.fetchByFilter({ kinds: [0], authors: [pubkey], limit: 1 }, url),
      );
      if (result._tag === "Success" && result.success.length > 0) {
        return yield* decodeAuthorProfile(result.success[0].content).pipe(
          Effect.orElseSucceed(() => null),
        );
      }
    }
    return null;
  });
}
