import { Effect, Ref } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import { unwrapEvent } from "nostr-tools/nip59";
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
import type { EpochStore } from "../db/epoch.ts";
import { getAllPublicKeys, addEpoch, persistEpochs, createEpochKey } from "../db/epoch.ts";
import { parseRotationEvent, parseRemovalNotice } from "../db/key-rotation.ts";
import type { RemovalNotice } from "../db/key-rotation.ts";

export interface SyncHandle {
  readonly sync: () => Effect.Effect<void, SyncError | RelayError | CryptoError | StorageError>;
  readonly publishLocal: (giftWrap: StoredGiftWrap) => Effect.Effect<void>;
  readonly startSubscription: () => Effect.Effect<void>;
  readonly addEpochSubscription: (publicKey: string) => Effect.Effect<void>;
}

export function createSyncHandle(
  storage: IDBStorageHandle,
  giftWrapHandle: GiftWrapHandle,
  relay: RelayHandle,
  publishQueue: PublishQueueHandle,
  syncStatus: SyncStatusHandle,
  watchCtx: WatchContext,
  relayUrls: readonly string[],
  epochStore: EpochStore,
  personalPrivateKey: Uint8Array,
  personalPublicKey: string,
  dbName: string,
  onSyncError?: ((error: unknown) => void) | undefined,
  onNewAuthor?: ((pubkey: string) => void) | undefined,
  onRemoved?: ((notice: RemovalNotice) => void) | undefined,
  onMembersChanged?: (() => void) | undefined,
): SyncHandle {
  const getSubscriptionPubKeys = (): string[] => {
    return getAllPublicKeys(epochStore);
  };

  // Check if a write should be rejected based on member removal
  const shouldRejectWrite = (
    authorPubkey: string,
    epochPublicKey: string,
  ): Effect.Effect<boolean, StorageError> =>
    Effect.gen(function* () {
      // Check epoch-based write rejection

      let writeEpoch;
      for (const epoch of epochStore.epochs.values()) {
        if (epoch.publicKey === epochPublicKey) {
          writeEpoch = epoch;
          break;
        }
      }
      if (!writeEpoch) return false;

      const memberRecord = yield* storage.getRecord("_members", authorPubkey);
      if (!memberRecord) return false;
      if (!memberRecord.removedAt) return false;

      return (memberRecord.removedAt as number) <= writeEpoch.createdAt;
    });

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

      // Write rejection: check if author was removed before this epoch
      const pTag = remoteGw.tags.find((t: string[]) => t[0] === "p")?.[1];
      if (pTag && rumor.pubkey) {
        const reject = yield* shouldRejectWrite(rumor.pubkey, pTag);
        if (reject) return null;
      }

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

      const author: string | undefined = rumor.pubkey || undefined;

      const event: StoredEvent = {
        id: rumor.id,
        collection: collectionName,
        recordId,
        kind,
        data,
        createdAt: rumor.created_at * 1000,
        author,
      };

      yield* storage.putEvent(event);
      yield* applyEvent(storage, event);

      if (author && onNewAuthor) {
        onNewAuthor(author);
      }

      return collectionName;
    });

  // Process a rotation event received on personal subscription
  const processRotationGiftWrap = (
    remoteGw: NostrEvent,
  ): Effect.Effect<boolean, StorageError | CryptoError> =>
    Effect.gen(function* () {
      // Try to unwrap rotation event with personal key

      const unwrapResult = yield* Effect.result(
        Effect.try({
          try: () => unwrapEvent(remoteGw, personalPrivateKey),
          catch: (e) =>
            new CryptoError({
              message: `Rotation unwrap failed: ${e instanceof Error ? e.message : String(e)}`,
              cause: e,
            }),
        }),
      );
      if (unwrapResult._tag === "Failure") return false;

      const rumor = unwrapResult.success;
      const dTag = rumor.tags.find((t: string[]) => t[0] === "d")?.[1];
      if (!dTag) return false;

      // Check for removal notice (addressed to the removed member)
      const removalNotice = parseRemovalNotice(rumor.content, dTag);
      if (removalNotice) {
        if (onRemoved) onRemoved(removalNotice);
        return true;
      }

      const rotationData = parseRotationEvent(rumor.content, dTag);
      if (!rotationData) return false;

      // Already have this epoch
      if (epochStore.epochs.has(rotationData.epochId)) return false;

      const epoch = createEpochKey(
        rotationData.epochId,
        rotationData.epochKey,
        Date.now(),
        rumor.pubkey || "",
        rotationData.parentEpoch,
      );
      addEpoch(epochStore, epoch);
      epochStore.currentEpochId = epoch.id;
      persistEpochs(epochStore, dbName);

      // Mark removed members
      let membersChanged = false;
      for (const removedPubkey of rotationData.removedMembers) {
        const memberRecord = yield* storage.getRecord("_members", removedPubkey);
        if (memberRecord && !memberRecord.removedAt) {
          yield* storage.putRecord("_members", {
            ...memberRecord,
            removedAt: Date.now(),
            removedInEpoch: epoch.id,
          });
          membersChanged = true;
        }
      }
      if (membersChanged && onMembersChanged) onMembersChanged();

      // Subscribe to the new epoch's public key
      yield* handle.addEpochSubscription(epoch.publicKey);

      return true;
    });

  const handle: SyncHandle = {
    sync: () =>
      Effect.gen(function* () {
        yield* syncStatus.set("syncing");
        yield* Ref.set(watchCtx.replayingRef, true);

        const changedCollections = new Set<string>();

        try {
          const pubKeys = getSubscriptionPubKeys();

          for (const url of relayUrls) {
            const reconcileResult = yield* Effect.result(
              reconcileWithRelay(storage, relay, url, pubKeys),
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
          if (onSyncError) onSyncError(result.failure);
        }
      }),

    startSubscription: () =>
      Effect.gen(function* () {
        const pubKeys = getSubscriptionPubKeys();

        // Subscribe to all epoch public keys for group data
        for (const url of relayUrls) {
          const subResult = yield* Effect.result(
            relay.subscribe({ kinds: [1059], "#p": pubKeys }, url, (evt: NostrEvent) => {
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
            if (onSyncError) onSyncError(subResult.failure);
          }
        }

        // Subscribe to personal pubkey for rotation events (multi-user only)
        if (!pubKeys.includes(personalPublicKey)) {
          for (const url of relayUrls) {
            yield* Effect.result(
              relay.subscribe(
                { kinds: [1059], "#p": [personalPublicKey] },
                url,
                (evt: NostrEvent) => {
                  Effect.runFork(
                    Effect.gen(function* () {
                      yield* Effect.result(processRotationGiftWrap(evt));
                    }),
                  );
                },
              ),
            );
          }
        }
      }),

    addEpochSubscription: (publicKey: string) =>
      Effect.gen(function* () {
        for (const url of relayUrls) {
          yield* Effect.result(
            relay.subscribe({ kinds: [1059], "#p": [publicKey] }, url, (evt: NostrEvent) => {
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
        }
      }),
  };

  return handle;
}
