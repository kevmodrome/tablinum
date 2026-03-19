import { Duration, Effect, Layer, Option, References, Ref, Schedule, Scope } from "effect";
import type { LogLevel } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import type { Filter } from "nostr-tools/filter";
import { unwrapEvent } from "nostr-tools/nip59";
import { GiftWrap } from "nostr-tools/kinds";
import type { IDBStorageHandle, StoredEvent, StoredGiftWrap } from "../storage/idb.ts";
import { applyEvent } from "../storage/records-store.ts";
import { pruneEvents } from "../crud/collection-handle.ts";
import type { GiftWrapHandle } from "./gift-wrap.ts";
import type { RelayHandle } from "./relay.ts";
import type { PublishQueueHandle } from "./publish-queue.ts";
import type { SyncStatusHandle } from "./sync-status.ts";
import { reconcileWithRelay } from "./negentropy.ts";
import type { WatchContext } from "../crud/watch.ts";
import { notifyChange, notifyReplayComplete } from "../crud/watch.ts";
import { CryptoError, RelayError, StorageError, SyncError } from "../errors.ts";
import type { EpochStore } from "../db/epoch.ts";
import { EpochId, getAllPublicKeys, addEpoch, createEpochKey } from "../db/epoch.ts";
import { parseRotationEvent, parseRemovalNotice } from "../db/key-rotation.ts";
import type { RemovalNotice } from "../db/key-rotation.ts";

export interface SyncHandle {
  readonly sync: () => Effect.Effect<void, SyncError | RelayError | CryptoError | StorageError>;
  readonly publishLocal: (giftWrap: StoredGiftWrap) => Effect.Effect<void>;
  readonly startSubscription: () => Effect.Effect<void>;
  readonly addEpochSubscription: (publicKey: string) => Effect.Effect<void>;
  readonly startHealing: () => void;
  readonly stopHealing: () => void;
}

export function createSyncHandle(
  storage: IDBStorageHandle,
  giftWrapHandle: GiftWrapHandle,
  relay: RelayHandle,
  publishQueue: PublishQueueHandle,
  syncStatus: SyncStatusHandle,
  watchCtx: WatchContext,
  relayUrls: readonly string[],
  knownCollections: ReadonlyMap<string, number>,
  epochStore: EpochStore,
  personalPrivateKey: Uint8Array,
  personalPublicKey: string,
  scope: Scope.Scope,
  logLevel: LogLevel.LogLevel,
  onSyncError?: ((error: unknown) => void) | undefined,
  onNewAuthor?: ((pubkey: string) => void) | undefined,
  onRemoved?: ((notice: RemovalNotice) => void) | undefined,
  onMembersChanged?: (() => void) | undefined,
): SyncHandle {
  const logLayer = Layer.succeed(References.MinimumLogLevel, logLevel);

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
        Effect.provide(logLayer),
        Effect.forkIn(scope),
      ),
    );
  };

  let autoFlushActive = false;

  const autoFlushEffect = Effect.gen(function* () {
    const size = yield* publishQueue.size();
    if (size === 0) return;
    yield* syncStatus.set("syncing");
    yield* publishQueue.flush(relayUrls);
    const remaining = yield* publishQueue.size();
    if (remaining > 0) yield* Effect.fail("pending");
  }).pipe(
    Effect.ensuring(syncStatus.set("idle")),
    Effect.retry({ schedule: Schedule.exponential(5000).pipe(Schedule.jittered), times: 10 }),
    Effect.ignore,
  );

  const scheduleAutoFlush = () => {
    if (autoFlushActive) return;
    autoFlushActive = true;
    forkHandled(
      autoFlushEffect.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            autoFlushActive = false;
          }),
        ),
      ),
    );
  };

  const shouldRejectWrite = (authorPubkey: string): Effect.Effect<boolean, StorageError> =>
    Effect.gen(function* () {
      const memberRecord = yield* storage.getRecord("_members", authorPubkey);
      if (!memberRecord) return false;
      return !!memberRecord.removedAt;
    });

  const processGiftWrap = (
    remoteGw: NostrEvent,
  ): Effect.Effect<string | null, StorageError | CryptoError> =>
    Effect.gen(function* () {
      const existing = yield* storage.getGiftWrap(remoteGw.id);
      if (existing) return null;

      const unwrapResult = yield* Effect.result(giftWrapHandle.unwrap(remoteGw));
      if (unwrapResult._tag === "Failure") {
        yield* storage.putGiftWrap({ id: remoteGw.id, event: remoteGw, createdAt: remoteGw.created_at });
        return null;
      }

      const rumor = unwrapResult.success;

      const dTag = rumor.tags.find((t: string[]) => t[0] === "d")?.[1];
      if (!dTag) {
        yield* storage.putGiftWrap({ id: remoteGw.id, event: remoteGw, createdAt: remoteGw.created_at });
        return null;
      }

      const colonIdx = dTag.indexOf(":");
      if (colonIdx === -1) {
        yield* storage.putGiftWrap({ id: remoteGw.id, event: remoteGw, createdAt: remoteGw.created_at });
        return null;
      }

      const collectionName = dTag.substring(0, colonIdx);
      const recordId = dTag.substring(colonIdx + 1);

      const retention = knownCollections.get(collectionName);
      if (retention === undefined) {
        yield* storage.putGiftWrap({ id: remoteGw.id, event: remoteGw, createdAt: remoteGw.created_at });
        return null;
      }

      if (rumor.pubkey) {
        const reject = yield* shouldRejectWrite(rumor.pubkey);
        if (reject) {
          yield* Effect.logWarning("Rejected write from removed member", {
            author: rumor.pubkey.slice(0, 12),
          });
          yield* storage.putGiftWrap({ id: remoteGw.id, event: remoteGw, createdAt: remoteGw.created_at });
          return null;
        }
      }

      let data: Record<string, unknown> | null = null;
      let kind: "c" | "u" | "d" = "u";

      const parsed = yield* Effect.try({
        try: () => JSON.parse(rumor.content) as Record<string, unknown> | null,
        catch: () => undefined,
      }).pipe(Effect.orElseSucceed(() => undefined));
      if (parsed === undefined) {
        yield* storage.putGiftWrap({ id: remoteGw.id, event: remoteGw, createdAt: remoteGw.created_at });
        return null;
      }

      if (parsed === null || parsed._deleted) {
        kind = "d";
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

      yield* storage.putGiftWrap({
        id: remoteGw.id,
        event: remoteGw,
        createdAt: remoteGw.created_at,
      });
      yield* storage.putEvent(event);
      const didApply = yield* applyEvent(storage, event);

      if (didApply && (kind === "u" || kind === "d")) {
        yield* pruneEvents(storage, collectionName, recordId, retention);
      }

      yield* Effect.logDebug("Processed gift wrap", {
        collection: collectionName,
        recordId,
        kind,
        author: author?.slice(0, 12),
      });

      if (author && onNewAuthor) {
        onNewAuthor(author);
      }

      return collectionName;
    });

  const processRealtimeGiftWrap = (remoteGw: NostrEvent): Effect.Effect<void> =>
    Effect.gen(function* () {
      const collection = yield* processGiftWrap(remoteGw).pipe(Effect.orElseSucceed(() => null));
      if (collection) {
        yield* notifyCollectionUpdated(collection);
      }
    });

  const processRotationGiftWrap = (
    remoteGw: NostrEvent,
  ): Effect.Effect<boolean, StorageError | CryptoError> =>
    Effect.gen(function* () {
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

      const removalNoticeOpt = parseRemovalNotice(rumor.content, dTag);
      if (Option.isSome(removalNoticeOpt)) {
        if (onRemoved) onRemoved(removalNoticeOpt.value);
        return true;
      }

      const rotationDataOpt = parseRotationEvent(rumor.content, dTag);
      if (Option.isNone(rotationDataOpt)) return false;
      const rotationData = rotationDataOpt.value;

      if (epochStore.epochs.has(rotationData.epochId)) return false;

      const epoch = createEpochKey(
        rotationData.epochId,
        rotationData.epochKey,
        rumor.pubkey || "",
        rotationData.parentEpoch,
      );
      addEpoch(epochStore, epoch);
      epochStore.currentEpochId = epoch.id;

      let membersChanged = false;
      for (const removedPubkey of rotationData.removedMembers) {
        const memberRecord = yield* storage.getRecord("_members", removedPubkey);
        if (memberRecord && !memberRecord.removedAt) {
          yield* storage.putRecord("_members", {
            ...memberRecord,
            removedAt: Date.now(),
            removedInEpoch: epoch.id,
          });
          yield* notifyChange(watchCtx, {
            collection: "_members",
            recordId: removedPubkey,
            kind: "update",
          });
          membersChanged = true;
        }
      }
      if (membersChanged && onMembersChanged) onMembersChanged();

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
          yield* relay
            .subscribe(filter, url, (event) => {
              forkHandled(onEvent(event));
            })
            .pipe(
              Effect.tapError((err) => Effect.sync(() => onSyncError?.(err))),
              Effect.ignore,
            );
        }),
      { discard: true },
    );

  const syncRelay = (
    url: string,
    pubKeys: ReadonlyArray<string>,
    changedCollections: Set<string>,
  ): Effect.Effect<void, StorageError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Syncing relay", { relay: url });
      const reconcileResult = yield* Effect.result(
        reconcileWithRelay(storage, relay, url, Array.from(pubKeys)),
      );
      if (reconcileResult._tag === "Failure") {
        onSyncError?.(reconcileResult.failure);
        return;
      }

      const { haveIds, needIds } = reconcileResult.success;

      yield* Effect.logDebug("Relay reconciliation result", {
        relay: url,
        need: needIds.length,
        have: haveIds.length,
      });

      if (needIds.length > 0) {
        const fetched = yield* relay.fetchEvents(needIds, url).pipe(
          Effect.tapError((err) => Effect.sync(() => onSyncError?.(err))),
          Effect.orElseSucceed(() => [] as NostrEvent[]),
        );
        const sorted = [...fetched].sort((a, b) => a.created_at - b.created_at);
        yield* Effect.forEach(
          sorted,
          (remoteGw) =>
            Effect.gen(function* () {
              const collection = yield* processGiftWrap(remoteGw).pipe(
                Effect.orElseSucceed(() => null),
              );
              if (collection) changedCollections.add(collection);
            }),
          { discard: true },
        );
      }

      if (haveIds.length > 0) {
        yield* Effect.forEach(
          haveIds,
          (id) =>
            Effect.gen(function* () {
              const gw = yield* storage.getGiftWrap(id);
              if (!gw?.event) return;

              yield* relay.publish(gw.event, [url]).pipe(
                Effect.tapError((err) => Effect.sync(() => onSyncError?.(err))),
                Effect.ignore,
              );
            }),
          { discard: true },
        );
      }
    }).pipe(Effect.withLogSpan("tablinum.syncRelay"));

  let healingActive = false;

  const healingEffect = Effect.gen(function* () {
    if (!healingActive) return;
    const status = yield* syncStatus.get();
    if (status === "syncing") return;

    yield* syncStatus.set("syncing");
    yield* Effect.gen(function* () {
      const pubKeys = getSubscriptionPubKeys();
      const changedCollections = new Set<string>();

      yield* Effect.forEach(relayUrls, (url) => syncRelay(url, pubKeys, changedCollections), {
        discard: true,
      });

      if (changedCollections.size > 0) {
        yield* notifyReplayComplete(watchCtx, [...changedCollections]);
      }
    }).pipe(Effect.ensuring(syncStatus.set("idle")));
  }).pipe(Effect.ignore);

  const handle: SyncHandle = {
    sync: () =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Sync started");
        yield* syncStatus.set("syncing");
        yield* Ref.set(watchCtx.replayingRef, true);

        const changedCollections = new Set<string>();

        yield* Effect.gen(function* () {
          const pubKeys = getSubscriptionPubKeys();
          yield* Effect.forEach(relayUrls, (url) => syncRelay(url, pubKeys, changedCollections), {
            discard: true,
          });

          yield* publishQueue.flush(relayUrls).pipe(Effect.ignore);
        }).pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              yield* notifyReplayComplete(watchCtx, [...changedCollections]);
              yield* syncStatus.set("idle");
            }),
          ),
        );

        yield* Effect.logInfo("Sync complete", { changed: [...changedCollections] });
      }).pipe(Effect.withLogSpan("tablinum.sync")),

    publishLocal: (giftWrap) =>
      Effect.gen(function* () {
        if (!giftWrap.event) return;
        yield* relay.publish(giftWrap.event, relayUrls).pipe(
          Effect.tapError(() =>
            storage
              .putGiftWrap(giftWrap)
              .pipe(
                Effect.andThen(publishQueue.enqueue(giftWrap.id)),
                Effect.andThen(Effect.sync(() => scheduleAutoFlush())),
              ),
          ),
          Effect.tapError((err) => Effect.sync(() => onSyncError?.(err))),
          Effect.ignore,
        );
      }),

    startSubscription: () =>
      Effect.gen(function* () {
        const pubKeys = getSubscriptionPubKeys();
        yield* subscribeAcrossRelays({ kinds: [GiftWrap], "#p": pubKeys }, processRealtimeGiftWrap);

        if (!pubKeys.includes(personalPublicKey)) {
          yield* subscribeAcrossRelays({ kinds: [GiftWrap], "#p": [personalPublicKey] }, (event) =>
            Effect.result(processRotationGiftWrap(event)).pipe(Effect.asVoid),
          );
        }
      }),

    addEpochSubscription: (publicKey: string) =>
      subscribeAcrossRelays({ kinds: [GiftWrap], "#p": [publicKey] }, processRealtimeGiftWrap),

    startHealing: () => {
      if (healingActive) return;
      healingActive = true;
      forkHandled(
        Effect.sleep(Duration.minutes(5)).pipe(
          Effect.andThen(healingEffect),
          Effect.repeat(Schedule.spaced(Duration.minutes(5))),
          Effect.ensuring(Effect.sync(() => { healingActive = false; })),
        ),
      );
    },

    stopHealing: () => {
      healingActive = false;
    },
  };

  forkHandled(
    publishQueue.size().pipe(
      Effect.flatMap((size) =>
        Effect.sync(() => {
          if (size > 0) scheduleAutoFlush();
        }),
      ),
    ),
  );

  return handle;
}
