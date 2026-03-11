import { Effect, Layer, Scope, ServiceMap } from "effect";
import type { SchemaConfig } from "../schema/types.ts";
import type { DatabaseHandle } from "./database-handle.ts";
import type { EpochKeyInput } from "./epoch.ts";
import { resolveRuntimeConfig } from "./runtime-config.ts";
import { CryptoError, StorageError, ValidationError } from "../errors.ts";
import { Config, type TablinumConfigShape } from "../services/Config.ts";
import { Tablinum } from "../services/Tablinum.ts";
import { TablinumLive } from "../layers/TablinumLive.ts";

export interface TablinumConfig<S extends SchemaConfig> {
  readonly schema: S;
  readonly relays: readonly string[];
  readonly privateKey?: Uint8Array | undefined;
  readonly epochKeys?: ReadonlyArray<EpochKeyInput> | undefined;
  readonly dbName?: string | undefined;
  readonly onSyncError?: ((error: Error) => void) | undefined;
  readonly onRemoved?: ((info: { epochId: string; removedBy: string }) => void) | undefined;
  readonly onMembersChanged?: (() => void) | undefined;
}

function validateConfig<S extends SchemaConfig>(
  config: TablinumConfig<S>,
): Effect.Effect<void, ValidationError> {
  return Effect.gen(function* () {
    if (Object.keys(config.schema).length === 0) {
      return yield* new ValidationError({
        message: "Schema must contain at least one collection",
      });
    }
  });
}

export function createTablinum<S extends SchemaConfig>(
  config: TablinumConfig<S>,
): Effect.Effect<DatabaseHandle<S>, ValidationError | StorageError | CryptoError, Scope.Scope> {
  return Effect.gen(function* () {
    yield* validateConfig(config);
    const runtimeConfig = yield* resolveRuntimeConfig(config);

    const configValue: TablinumConfigShape = {
      ...runtimeConfig,
      schema: config.schema,
      onSyncError: config.onSyncError,
      onRemoved: config.onRemoved,
      onMembersChanged: config.onMembersChanged,
    };

    const configLayer = Layer.succeed(Config, configValue);
    const fullLayer = TablinumLive.pipe(Layer.provide(configLayer));
    const ctx = yield* Layer.build(fullLayer);
    return ServiceMap.get(ctx, Tablinum) as unknown as DatabaseHandle<S>;
  });
}
