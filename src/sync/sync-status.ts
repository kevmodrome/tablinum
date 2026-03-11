import { Effect, SubscriptionRef } from "effect";
import type { SyncStatus } from "../db/database-handle.ts";

export interface SyncStatusHandle {
  readonly get: () => Effect.Effect<SyncStatus>;
  readonly set: (status: SyncStatus) => Effect.Effect<void>;
  readonly subscribe: (callback: (status: SyncStatus) => void) => () => void;
}

export function createSyncStatusHandle(): Effect.Effect<SyncStatusHandle> {
  return Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make<SyncStatus>("idle");
    const listeners = new Set<(status: SyncStatus) => void>();
    return {
      get: () => SubscriptionRef.get(ref),
      set: (status: SyncStatus) =>
        Effect.gen(function* () {
          yield* SubscriptionRef.set(ref, status);
          for (const listener of listeners) listener(status);
        }),
      subscribe: (callback: (status: SyncStatus) => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    };
  });
}
