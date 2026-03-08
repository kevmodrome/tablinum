import { Effect, Ref } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import type { IDBStorageHandle, StoredEvent, StoredGiftWrap } from "../storage/idb.ts";
import { applyEvent } from "../storage/records-store.ts";
import type { GiftWrapHandle } from "./gift-wrap.ts";
import type { RelayHandle } from "./relay.ts";
import type { PublishQueueHandle } from "./publish-queue.ts";
import type { SyncStatusHandle } from "./sync-status.ts";
import { reconcileWithRelay } from "./negentropy.ts";
import type { WatchContext } from "../crud/watch.ts";
import { notifyChange, notifyReplayComplete } from "../crud/watch.ts";
import { CryptoError, RelayError, StorageError, SyncError } from "../errors.ts";

export interface SyncHandle {
  readonly sync: () => Effect.Effect<void, SyncError | RelayError | CryptoError | StorageError>;
  readonly publishLocal: (giftWrap: StoredGiftWrap) => Effect.Effect<void>;
  readonly startSubscription: () => Effect.Effect<void>;
}

export function createSyncHandle(
  storage: IDBStorageHandle,
  giftWrapHandle: GiftWrapHandle,
  relay: RelayHandle,
  publishQueue: PublishQueueHandle,
  syncStatus: SyncStatusHandle,
  watchCtx: WatchContext,
  relayUrls: readonly string[],
  publicKey: string,
  onSyncError?: ((error: unknown) => void) | undefined,
): SyncHandle {
  // Process a single remote gift wrap: store, unwrap, apply event
  const processGiftWrap = (
    remoteGw: NostrEvent,
  ): Effect.Effect<string | null, StorageError | CryptoError> =>
    Effect.gen(function* () {
      // Skip if we already have this gift wrap
      const existing = yield* storage.getGiftWrap(remoteGw.id);
      if (existing) return null;

      // Store gift wrap
      yield* storage.putGiftWrap({
        id: remoteGw.id,
        event: remoteGw as unknown as Record<string, unknown>,
        createdAt: remoteGw.created_at,
      });

      // Unwrap to get rumor
      const unwrapResult = yield* Effect.result(giftWrapHandle.unwrap(remoteGw));
      if (unwrapResult._tag === "Failure") return null;

      const rumor = unwrapResult.success;

      // Parse the rumor content and d-tag
      const dTag = rumor.tags.find((t: string[]) => t[0] === "d")?.[1];
      if (!dTag) return null;

      const colonIdx = dTag.indexOf(":");
      if (colonIdx === -1) return null;

      const collectionName = dTag.substring(0, colonIdx);
      const recordId = dTag.substring(colonIdx + 1);

      let data: Record<string, unknown> | null = null;
      let kind: "create" | "update" | "delete" = "update";

      try {
        const parsed = JSON.parse(rumor.content);
        if (parsed === null || parsed._deleted) {
          kind = "delete";
        } else {
          data = parsed;
        }
      } catch {
        return null;
      }

      const event: StoredEvent = {
        id: rumor.id,
        collection: collectionName,
        recordId,
        kind,
        data,
        createdAt: rumor.created_at * 1000,
      };

      yield* storage.putEvent(event);
      yield* applyEvent(storage, event);
      return collectionName;
    });

  return {
    sync: () =>
      Effect.gen(function* () {
        yield* syncStatus.set("syncing");
        yield* Ref.set(watchCtx.replayingRef, true);

        const changedCollections = new Set<string>();

        try {
          for (const url of relayUrls) {
            const reconcileResult = yield* Effect.result(
              reconcileWithRelay(storage, relay, url, publicKey),
            );

            if (reconcileResult._tag === "Failure") continue;

            const { haveIds, needIds } = reconcileResult.success;

            // Download missing gift wraps
            if (needIds.length > 0) {
              const fetchResult = yield* Effect.result(relay.fetchEvents(needIds, url));

              if (fetchResult._tag === "Success") {
                for (const remoteGw of fetchResult.success) {
                  const result = yield* Effect.result(processGiftWrap(remoteGw));
                  if (result._tag === "Success" && result.success) {
                    changedCollections.add(result.success);
                  }
                }
              }
            }

            // Upload gift wraps the relay is missing
            if (haveIds.length > 0) {
              for (const id of haveIds) {
                const gw = yield* storage.getGiftWrap(id);
                if (gw) {
                  yield* Effect.result(relay.publish(gw.event as unknown as NostrEvent, [url]));
                }
              }
            }
          }

          // Flush pending publications
          yield* Effect.result(publishQueue.flush(relayUrls));
        } finally {
          yield* notifyReplayComplete(watchCtx, [...changedCollections]);
          yield* syncStatus.set("idle");
        }
      }),

    publishLocal: (giftWrap) =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          relay.publish(giftWrap.event as unknown as NostrEvent, relayUrls),
        );
        if (result._tag === "Failure") {
          yield* publishQueue.enqueue(giftWrap.id);
          console.error("[localstr:publishLocal] relay error:", result.failure);
          if (onSyncError) onSyncError(result.failure);
        }
      }),

    startSubscription: () =>
      Effect.gen(function* () {
        for (const url of relayUrls) {
          const subResult = yield* Effect.result(
            relay.subscribe({ kinds: [1059], "#p": [publicKey] }, url, (evt: NostrEvent) => {
              // Process incoming gift wrap in a fire-and-forget fiber
              Effect.runFork(
                Effect.gen(function* () {
                  const result = yield* Effect.result(processGiftWrap(evt));
                  if (result._tag === "Success" && result.success) {
                    yield* notifyChange(watchCtx, {
                      collection: result.success,
                      recordId: "",
                      kind: "create",
                    });
                  }
                }),
              );
            }),
          );
          if (subResult._tag === "Failure") {
            console.error("[localstr:subscribe] failed for", url, subResult.failure);
            if (onSyncError) onSyncError(subResult.failure);
          } else {
            console.log("[localstr:subscribe] listening on", url);
          }
        }
      }),
  };
}
