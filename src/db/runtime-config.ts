import { Effect, Schema } from "effect";
import { ValidationError } from "../errors.ts";
import { EpochId, EpochKeyInputSchema, type EpochKeyInput, DatabaseName } from "./epoch.ts";

export interface RuntimeConfigSource {
  readonly relays: readonly string[];
  readonly privateKey?: Uint8Array | undefined;
  readonly epochKeys?: ReadonlyArray<EpochKeyInput> | undefined;
  readonly dbName?: string | undefined;
}

export interface ResolvedRuntimeConfig {
  readonly relays: readonly string[];
  readonly privateKey?: Uint8Array | undefined;
  readonly epochKeys?: ReadonlyArray<EpochKeyInput> | undefined;
  readonly dbName: DatabaseName;
}

const PrivateKeySchema = Schema.Uint8Array.check(Schema.isMinLength(32), Schema.isMaxLength(32));

const RuntimeConfigSchema = Schema.Struct({
  relays: Schema.NonEmptyArray(Schema.String),
  dbName: Schema.optional(Schema.String),
  privateKey: Schema.optional(PrivateKeySchema),
  epochKeys: Schema.optional(Schema.Array(EpochKeyInputSchema)),
});

export function resolveRuntimeConfig(
  source: RuntimeConfigSource,
): Effect.Effect<ResolvedRuntimeConfig, ValidationError> {
  return Schema.decodeUnknownEffect(RuntimeConfigSchema)(source).pipe(
    Effect.map((config) => ({
      relays: [...config.relays],
      privateKey: config.privateKey,
      epochKeys: config.epochKeys?.map((ek) => ({ epochId: EpochId(ek.epochId), key: ek.key })),
      dbName: DatabaseName(config.dbName ?? "tablinum"),
    })),
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: `Invalid Tablinum configuration: ${error.message}`,
        }),
    ),
  );
}
