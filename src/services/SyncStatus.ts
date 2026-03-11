import { ServiceMap } from "effect";
import type { SyncStatusHandle } from "../sync/sync-status.ts";

export class SyncStatus extends ServiceMap.Service<SyncStatus, SyncStatusHandle>()(
  "tablinum/SyncStatus",
) {}
