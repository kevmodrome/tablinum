import { Effect, Layer, References, Scope, ServiceMap } from "effect";
import type { LogLevel } from "effect";
import type { SchemaConfig } from "../schema/types.ts";
import type { DatabaseHandle } from "./database-handle.ts";
import type { EpochKeyInput } from "./epoch.ts";
import { resolveRuntimeConfig } from "./runtime-config.ts";
import { CryptoError, StorageError, ValidationError } from "../errors.ts";
import { Config, type TablinumConfigShape } from "../services/Config.ts";
import { Tablinum } from "../services/Tablinum.ts";
import { TablinumLive } from "../layers/TablinumLive.ts";

export type TablinumLogLevel = "debug" | "info" | "warning" | "error" | "none" | LogLevel.LogLevel;

export function resolveLogLevel(input: TablinumLogLevel | undefined): LogLevel.LogLevel {
  if (input === undefined || input === "none") return "None";
  switch (input) {
    case "debug":
      return "Debug";
    case "info":
      return "Info";
    case "warning":
      return "Warn";
    case "error":
      return "Error";
    default:
      return input;
  }
}

export interface TablinumConfig<S extends SchemaConfig> {
  readonly schema: S;
  readonly relays: readonly string[];
  readonly privateKey?: Uint8Array | undefined;
  readonly epochKeys?: ReadonlyArray<EpochKeyInput> | undefined;
  readonly dbName?: string | undefined;
  readonly logLevel?: TablinumLogLevel | undefined;
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
    const logLevel = resolveLogLevel(config.logLevel);

    const configValue: TablinumConfigShape = {
      ...runtimeConfig,
      schema: config.schema,
      logLevel,
      onSyncError: config.onSyncError,
      onRemoved: config.onRemoved,
      onMembersChanged: config.onMembersChanged,
    };

    const configLayer = Layer.succeed(Config, configValue);
    const logLayer = Layer.succeed(References.MinimumLogLevel, logLevel);
    const fullLayer = TablinumLive.pipe(Layer.provide(configLayer), Layer.provide(logLayer));
    const ctx = yield* Layer.build(fullLayer);
    return ServiceMap.get(ctx, Tablinum) as unknown as DatabaseHandle<S>;
  });
}
