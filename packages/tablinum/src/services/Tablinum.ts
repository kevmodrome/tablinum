import { ServiceMap } from "effect";
import type { DatabaseHandle } from "../db/database-handle.ts";
import type { SchemaConfig } from "../schema/types.ts";

export class Tablinum extends ServiceMap.Service<Tablinum, DatabaseHandle<SchemaConfig>>()(
  "tablinum/Tablinum",
) {}
