import { ServiceMap } from "effect";
import type { SyncHandle } from "../sync/sync-service.ts";

export class Sync extends ServiceMap.Service<Sync, SyncHandle>()("tablinum/Sync") {}
