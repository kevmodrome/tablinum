import { Effect, Option, Ref, Scope } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import type { Filter } from "nostr-tools/filter";
import { unwrapEvent } from "nostr-tools/nip59";
import { GiftWrap } from "nostr-tools/kinds";
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
import {
  EpochId,
  type DatabaseName,
  getAllPublicKeys,
  addEpoch,
  persistEpochs,
  createEpochKey,
} from "../db/epoch.ts";
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
  dbName: DatabaseName,
  scope: Scope.Scope,
  onSyncError?: ((error: unknown) => void) | undefined,
  onNewAuthor?: ((pubkey: string) => void) | undefined,
  onRemoved?: ((notice: RemovalNotice) => void) | undefined,
  onMembersChanged?: (() => void) | undefined,
): SyncHandle {
  const getSubscriptionPubKeys = (): string[] => {
    return getAllPublicKeys(epochStore);
  };

  const notifyCollectionUpdated = (collection: string) =>
    notifyChange(watchCtx, {
      collection,
      recordId: "",
      kind: "create",
    });

  const forkHandled = (effect: Effect.Effect<void>) => {
    Effect.runFork(
      effect.pipe(
        Effect.tapError((e) => Effect.sync(() => onSyncError?.(e))),
        Effect.ignore,
        Effect.forkIn(scope),
      ),
    );
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
        event: remoteGw,
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

      const parsed = yield* Effect.try({
        try: () => JSON.parse(rumor.content) as Record<string, unknown> | null,
        catch: () => undefined,
      }).pipe(Effect.orElseSucceed(() => undefined));
      if (parsed === undefined) return null;

      if (parsed === null || parsed._deleted) {
        kind = "delete";
      } else {
        data = parsed;
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

  const processRealtimeGiftWrap = (remoteGw: NostrEvent): Effect.Effect<void> =>
    Effect.gen(function* () {
      const result = yield* Effect.result(processGiftWrap(remoteGw));
      if (result._tag === "Success" && result.success) {
        yield* notifyCollectionUpdated(result.success);
      }
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
      const removalNoticeOpt = parseRemovalNotice(rumor.content, dTag);
      if (Option.isSome(removalNoticeOpt)) {
        if (onRemoved) onRemoved(removalNoticeOpt.value);
        return true;
      }

      const rotationDataOpt = parseRotationEvent(rumor.content, dTag);
      if (Option.isNone(rotationDataOpt)) return false;
      const rotationData = rotationDataOpt.value;

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

  const subscribeAcrossRelays = (
    filter: Filter,
    onEvent: (event: NostrEvent) => Effect.Effect<void>,
  ): Effect.Effect<void> =>
    Effect.forEach(
      relayUrls,
      (url) =>
        Effect.gen(function* () {
          const subscribeResult = yield* Effect.result(
            relay.subscribe(filter, url, (event) => {
              forkHandled(onEvent(event));
            }),
          );
          if (subscribeResult._tag === "Failure") {
            onSyncError?.(subscribeResult.failure);
          }
        }),
      { discard: true },
    );

  const syncRelay = (
    url: string,
    pubKeys: ReadonlyArray<string>,
    changedCollections: Set<string>,
  ): Effect.Effect<void, StorageError> =>
    Effect.gen(function* () {
      const reconcileResult = yield* Effect.result(
        reconcileWithRelay(storage, relay, url, Array.from(pubKeys)),
      );
      if (reconcileResult._tag === "Failure") {
        onSyncError?.(reconcileResult.failure);
        return;
      }

      const { haveIds, needIds } = reconcileResult.success;

      if (needIds.length > 0) {
        const fetchResult = yield* Effect.result(relay.fetchEvents(needIds, url));
        if (fetchResult._tag === "Failure") {
          onSyncError?.(fetchResult.failure);
        } else {
          yield* Effect.forEach(
            fetchResult.success,
            (remoteGw) =>
              Effect.gen(function* () {
                const processed = yield* Effect.result(processGiftWrap(remoteGw));
                if (processed._tag === "Success" && processed.success) {
                  changedCollections.add(processed.success);
                }
              }),
            { discard: true },
          );
        }
      }

      if (haveIds.length > 0) {
        yield* Effect.forEach(
          haveIds,
          (id) =>
            Effect.gen(function* () {
              const giftWrap = yield* storage.getGiftWrap(id);
              if (giftWrap) {
                const pubResult = yield* Effect.result(relay.publish(giftWrap.event, [url]));
                if (pubResult._tag === "Failure") {
                  onSyncError?.(pubResult.failure);
                }
              }
            }),
          { discard: true },
        );
      }
    });

  const handle: SyncHandle = {
    sync: () =>
      Effect.gen(function* () {
        yield* syncStatus.set("syncing");
        yield* Ref.set(watchCtx.replayingRef, true);

        const changedCollections = new Set<string>();

        yield* Effect.gen(function* () {
          const pubKeys = getSubscriptionPubKeys();
          yield* Effect.forEach(relayUrls, (url) => syncRelay(url, pubKeys, changedCollections), {
            discard: true,
          });

          // Flush pending publications
          yield* Effect.result(publishQueue.flush(relayUrls));
        }).pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              yield* notifyReplayComplete(watchCtx, [...changedCollections]);
              yield* syncStatus.set("idle");
            }),
          ),
        );
      }),

    publishLocal: (giftWrap) =>
      Effect.gen(function* () {
        const result = yield* Effect.result(relay.publish(giftWrap.event, relayUrls));
        if (result._tag === "Failure") {
          yield* publishQueue.enqueue(giftWrap.id);
          if (onSyncError) onSyncError(result.failure);
        }
      }),

    startSubscription: () =>
      Effect.gen(function* () {
        const pubKeys = getSubscriptionPubKeys();
        yield* subscribeAcrossRelays({ kinds: [GiftWrap], "#p": pubKeys }, processRealtimeGiftWrap);

        // Subscribe to personal pubkey for rotation events (multi-user only)
        if (!pubKeys.includes(personalPublicKey)) {
          yield* subscribeAcrossRelays({ kinds: [GiftWrap], "#p": [personalPublicKey] }, (event) =>
            Effect.result(processRotationGiftWrap(event)).pipe(Effect.asVoid),
          );
        }
      }),

    addEpochSubscription: (publicKey: string) =>
      subscribeAcrossRelays({ kinds: [GiftWrap], "#p": [publicKey] }, processRealtimeGiftWrap),
  };

  return handle;
}
