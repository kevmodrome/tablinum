import { ServiceMap } from "effect";
import type { LogLevel } from "effect";
import type { ResolvedRuntimeConfig } from "../db/runtime-config.ts";
import type { SchemaConfig } from "../schema/types.ts";

export interface TablinumConfigShape extends ResolvedRuntimeConfig {
  readonly schema: SchemaConfig;
  readonly logLevel: LogLevel.LogLevel;
  readonly onSyncError?: ((error: Error) => void) | undefined;
  readonly onRemoved?: ((info: { epochId: string; removedBy: string }) => void) | undefined;
  readonly onMembersChanged?: (() => void) | undefined;
}

export class Config extends ServiceMap.Service<Config, TablinumConfigShape>()("tablinum/Config") {}
