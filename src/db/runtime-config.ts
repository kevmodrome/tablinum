import { Effect, Schema } from "effect";
import { ValidationError } from "../errors.ts";
import { EpochKeyInputSchema, type EpochKeyInput } from "./epoch.ts";

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
  readonly dbName: string;
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
      ...config,
      relays: [...config.relays],
      dbName: config.dbName ?? "tablinum",
    })),
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: `Invalid Tablinum configuration: ${error.message}`,
        }),
    ),
  );
}
