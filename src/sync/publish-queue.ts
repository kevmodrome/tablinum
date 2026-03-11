import { Effect, Ref } from "effect";
import type { IDBStorageHandle } from "../storage/idb.ts";
import type { RelayHandle } from "./relay.ts";
import type { RelayError, StorageError } from "../errors.ts";

export interface PublishQueueHandle {
  readonly enqueue: (eventId: string) => Effect.Effect<void>;
  readonly flush: (relayUrls: readonly string[]) => Effect.Effect<void, RelayError | StorageError>;
  readonly size: () => Effect.Effect<number>;
  readonly subscribe: (callback: (count: number) => void) => () => void;
}

const META_KEY = "publish_queue";

function persist(
  storage: IDBStorageHandle,
  pending: Set<string>,
): Effect.Effect<void, StorageError> {
  return storage.putMeta(META_KEY, [...pending]);
}

export function createPublishQueue(
  storage: IDBStorageHandle,
  relay: RelayHandle,
): Effect.Effect<PublishQueueHandle, StorageError> {
  return Effect.gen(function* () {
    const stored = yield* storage.getMeta(META_KEY);
    const initial = Array.isArray(stored) ? new Set<string>(stored as string[]) : new Set<string>();
    const pendingRef = yield* Ref.make<Set<string>>(initial);
    const listeners = new Set<(count: number) => void>();

    const notify = (pending: Set<string>) => {
      for (const listener of listeners) listener(pending.size);
    };

    return {
      enqueue: (eventId) =>
        Effect.gen(function* () {
          const next = yield* Ref.updateAndGet(pendingRef, (set) => {
            const n = new Set(set);
            n.add(eventId);
            return n;
          });
          yield* Effect.result(persist(storage, next));
          notify(next);
        }),

      flush: (relayUrls) =>
        Effect.gen(function* () {
          const pending = yield* Ref.get(pendingRef);
          if (pending.size === 0) return;

          const succeeded = new Set<string>();
          let consecutiveFailures = 0;

          for (const eventId of pending) {
            if (consecutiveFailures >= 3) break;

            const gw = yield* storage.getGiftWrap(eventId);
            if (!gw || !gw.event) {
              succeeded.add(eventId);
              consecutiveFailures = 0;
              continue;
            }
            const result = yield* Effect.result(relay.publish(gw.event, relayUrls));
            if (result._tag === "Success") {
              succeeded.add(eventId);
              yield* storage.stripGiftWrapBlob(eventId);
              consecutiveFailures = 0;
            } else {
              consecutiveFailures++;
            }
          }

          if (succeeded.size > 0) {
            const updated = yield* Ref.updateAndGet(pendingRef, (set) => {
              const next = new Set(set);
              for (const id of succeeded) {
                next.delete(id);
              }
              return next;
            });
            yield* persist(storage, updated);
            notify(updated);
          }
        }),

      size: () => Ref.get(pendingRef).pipe(Effect.map((s) => s.size)),

      subscribe: (callback) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    };
  });
}
