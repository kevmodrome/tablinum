import { Effect, SubscriptionRef } from "effect";
import type { SyncStatus } from "../db/database-handle.ts";

export interface SyncStatusHandle {
  readonly get: () => Effect.Effect<SyncStatus>;
  readonly set: (status: SyncStatus) => Effect.Effect<void>;
}

export function createSyncStatusHandle(): Effect.Effect<SyncStatusHandle> {
  return Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make<SyncStatus>("idle");
    return {
      get: () => SubscriptionRef.get(ref),
      set: (status: SyncStatus) => SubscriptionRef.set(ref, status),
    };
  });
}
