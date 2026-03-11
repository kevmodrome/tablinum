import { Effect, Ref } from "effect";
import type { IDBStorageHandle } from "../storage/idb.ts";
import type { RelayHandle } from "./relay.ts";
import type { RelayError, StorageError } from "../errors.ts";

export interface PublishQueueHandle {
  readonly enqueue: (eventId: string) => Effect.Effect<void>;
  readonly flush: (relayUrls: readonly string[]) => Effect.Effect<void, RelayError | StorageError>;
  readonly size: () => Effect.Effect<number>;
}

export function createPublishQueue(
  storage: IDBStorageHandle,
  relay: RelayHandle,
): Effect.Effect<PublishQueueHandle> {
  return Effect.gen(function* () {
    const pendingRef = yield* Ref.make<Set<string>>(new Set());

    return {
      enqueue: (eventId) =>
        Ref.update(pendingRef, (set) => {
          const next = new Set(set);
          next.add(eventId);
          return next;
        }),

      flush: (relayUrls) =>
        Effect.gen(function* () {
          const pending = yield* Ref.get(pendingRef);
          if (pending.size === 0) return;

          const succeeded = new Set<string>();

          for (const eventId of pending) {
            const gw = yield* storage.getGiftWrap(eventId);
            if (!gw) {
              succeeded.add(eventId);
              continue;
            }
            const result = yield* Effect.result(relay.publish(gw.event, relayUrls));
            if (result._tag === "Success") {
              succeeded.add(eventId);
            }
          }

          yield* Ref.update(pendingRef, (set) => {
            const next = new Set(set);
            for (const id of succeeded) {
              next.delete(id);
            }
            return next;
          });
        }),

      size: () => Ref.get(pendingRef).pipe(Effect.map((s) => s.size)),
    };
  });
}
