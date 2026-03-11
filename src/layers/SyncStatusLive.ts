import { Layer } from "effect";
import { SyncStatus } from "../services/SyncStatus.ts";
import { createSyncStatusHandle } from "../sync/sync-status.ts";

export const SyncStatusLive = Layer.effect(SyncStatus, createSyncStatusHandle());
