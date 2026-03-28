import { Effect, Exit, Layer, Option, PubSub, References, Ref, Scope } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import type { SchemaConfig } from "../schema/types.ts";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { ChangeEvent } from "../crud/watch.ts";
import { notifyChange, notifyReplayComplete } from "../crud/watch.ts";
import type { StoredEvent, IDBStorageHandle } from "../storage/idb.ts";
import { applyEvent } from "../storage/records-store.ts";
import { rebuild as rebuildRecords } from "../storage/records-store.ts";
import { buildValidator, buildPartialValidator } from "../schema/validate.ts";
import {
  createCollectionHandle,
  type CollectionHandle,
  type OnWriteCallback,
} from "../crud/collection-handle.ts";
import { createSyncHandle, type SyncHandle } from "../sync/sync-service.ts";
import { membersCollectionDef, fetchAuthorProfile } from "../db/members.ts";
import type { MemberRecord } from "../db/members.ts";
import type { Invite } from "../db/invite.ts";
import type { DatabaseHandle } from "../db/database-handle.ts";
import {
  EpochId,
  getCurrentEpoch,
  getDecryptionKey,
  addEpoch,
  stringifyEpochStore,
  exportEpochKeys,
} from "../db/epoch.ts";
import type { EpochStore as EpochStoreShape } from "../db/epoch.ts";
import { createRotation } from "../db/key-rotation.ts";
import { uuidv7 } from "../utils/uuid.ts";
import { StorageError, SyncError, ValidationError } from "../errors.ts";
import { deleteIDBStorage } from "../storage/idb.ts";
import { createDeletionEvent } from "../sync/deletion.ts";

import { Tablinum } from "../services/Tablinum.ts";
import { Config } from "../services/Config.ts";
import { Identity } from "../services/Identity.ts";
import { EpochStore } from "../services/EpochStore.ts";
import { Storage } from "../services/Storage.ts";
import { Relay } from "../services/Relay.ts";
import { GiftWrap } from "../services/GiftWrap.ts";
import { PublishQueue } from "../services/PublishQueue.ts";
import { SyncStatus } from "../services/SyncStatus.ts";

import { IdentityLive } from "./IdentityLive.ts";
import { EpochStoreLive } from "./EpochStoreLive.ts";
import { StorageLive } from "./StorageLive.ts";
import { RelayLive } from "./RelayLive.ts";
import { GiftWrapLive } from "./GiftWrapLive.ts";
import { PublishQueueLive } from "./PublishQueueLive.ts";
import { SyncStatusLive } from "./SyncStatusLive.ts";

type AnyCollectionHandle = CollectionHandle<CollectionDef<CollectionFields>>;
type CollectionEntry = readonly [string, CollectionDef<CollectionFields>];

function reportSyncError(onSyncError: ((error: Error) => void) | undefined, error: unknown): void {
  if (!onSyncError) return;
  onSyncError(error instanceof Error ? error : new Error(String(error)));
}

function mapMemberRecord(record: Record<string, unknown>): MemberRecord {
  return {
    id: record.id as string,
    addedAt: record.addedAt as number,
    addedInEpoch: record.addedInEpoch as EpochId,
    ...(record.name !== undefined ? { name: record.name as string } : {}),
    ...(record.picture !== undefined ? { picture: record.picture as string } : {}),
    ...(record.about !== undefined ? { about: record.about as string } : {}),
    ...(record.nip05 !== undefined ? { nip05: record.nip05 as string } : {}),
    ...(record.removedAt !== undefined ? { removedAt: record.removedAt as number } : {}),
    ...(record.removedInEpoch !== undefined
      ? { removedInEpoch: record.removedInEpoch as EpochId }
      : {}),
  };
}

const IdentityWithDeps = IdentityLive.pipe(Layer.provide(StorageLive));

const EpochStoreWithDeps = EpochStoreLive.pipe(
  Layer.provide(IdentityWithDeps),
  Layer.provide(StorageLive),
);

const GiftWrapWithDeps = GiftWrapLive.pipe(
  Layer.provide(IdentityWithDeps),
  Layer.provide(EpochStoreWithDeps),
);

const PublishQueueWithDeps = PublishQueueLive.pipe(
  Layer.provide(StorageLive),
  Layer.provide(RelayLive),
);

const AllServicesLive = Layer.mergeAll(
  IdentityWithDeps,
  EpochStoreWithDeps,
  StorageLive,
  RelayLive,
  GiftWrapWithDeps,
  PublishQueueWithDeps,
  SyncStatusLive,
);

export const TablinumLive = Layer.effect(
  Tablinum,
  Effect.gen(function* () {
    const config = yield* Config;
    const identity = yield* Identity;
    const epochStore = yield* EpochStore;
    const storage = yield* Storage;
    const relay = yield* Relay;
    const giftWrap = yield* GiftWrap;
    const publishQueue = yield* PublishQueue;
    const syncStatus = yield* SyncStatus;
    const scope = yield* Effect.scope;

    const logLayer = Layer.succeed(References.MinimumLogLevel, config.logLevel);

    const pubsub = yield* PubSub.unbounded<ChangeEvent>();
    const replayingRef = yield* Ref.make(false);
    const closedRef = yield* Ref.make(false);
    const watchCtx = { pubsub, replayingRef };

    const schemaEntries = Object.entries(config.schema) as CollectionEntry[];
    const allSchemaEntries = [...schemaEntries, ["_members", membersCollectionDef] as const];
    const knownCollections = new Map(
      allSchemaEntries.map(([, def]) => [def.name, def.eventRetention]),
    );

    let notifyAuthor: ((pubkey: string) => void) | undefined;

    const syncHandle: SyncHandle = createSyncHandle(
      storage,
      giftWrap,
      relay,
      publishQueue,
      syncStatus,
      watchCtx,
      config.relays,
      knownCollections,
      epochStore,
      identity.privateKey,
      identity.publicKey,
      scope,
      config.logLevel,
      config.onSyncError ? (error) => reportSyncError(config.onSyncError, error) : undefined,
      (pubkey) => notifyAuthor?.(pubkey),
      config.onRemoved,
      config.onMembersChanged,
    );

    const onWrite: OnWriteCallback = (event) =>
      Effect.gen(function* () {
        const content = event.kind === "d" ? JSON.stringify(null) : JSON.stringify(event.data);
        const dTag = `${event.collection}:${event.recordId}`;

        const wrapResult = yield* Effect.result(
          giftWrap.wrap({
            kind: 1,
            content,
            tags: [["d", dTag]],
            created_at: Math.floor(event.createdAt / 1000),
          }),
        );

        if (wrapResult._tag === "Failure") {
          reportSyncError(config.onSyncError, wrapResult.failure);
          return;
        }

        const gw = wrapResult.success;
        yield* storage.putGiftWrap({ id: gw.id, event: gw, createdAt: gw.created_at });

        // Track which gift wrap represents this record so we can send
        // a NIP-09 deletion for the previous one. NIP-59 specifies that
        // relays SHOULD honor deletions signed by the p-tag recipient
        // (the epoch key holder), so any member can clean up old events.
        const metaKey = `gw_record:${event.collection}:${event.recordId}`;
        const prevMapping = (yield* storage.getMeta(metaKey).pipe(
          Effect.orElseSucceed(() => undefined),
        )) as { gwId: string; epochPubKey: string } | undefined;

        const epochPubKey = gw.tags.find((t: string[]) => t[0] === "p")?.[1];
        yield* storage.putMeta(metaKey, { gwId: gw.id, epochPubKey });

        yield* Effect.forkIn(
          Effect.gen(function* () {
            const publishResult = yield* Effect.result(
              syncHandle.publishLocal({
                id: gw.id,
                event: gw,
                createdAt: gw.created_at,
              }),
            );
            if (publishResult._tag === "Failure") {
              reportSyncError(config.onSyncError, publishResult.failure);
            }

            // NIP-09: delete the previous gift wrap for this record from relays
            if (prevMapping?.epochPubKey) {
              const signingKey = getDecryptionKey(epochStore, prevMapping.epochPubKey);
              if (signingKey) {
                const deletionEvent = createDeletionEvent(
                  [prevMapping.gwId],
                  signingKey,
                );
                yield* relay.publish(deletionEvent, [...config.relays]).pipe(
                  Effect.tapError((e) =>
                    Effect.sync(() => reportSyncError(config.onSyncError, e)),
                  ),
                  Effect.ignore,
                );
              }
              yield* storage.deleteGiftWrap(prevMapping.gwId).pipe(Effect.ignore);
            }
          }),
          scope,
        );
      });

    // Re-wrap all current record state under the current epoch key.
    // Called during key rotation so that data is no longer exclusively
    // stored under old epoch keys that removed members still hold.
    const republishAllUnderCurrentEpoch = (): Effect.Effect<void, StorageError> =>
      Effect.gen(function* () {
        const oldGwDeletions: Array<{ gwId: string; epochPubKey: string }> = [];

        for (const [, def] of allSchemaEntries) {
          const collectionName = def.name;
          const allRecords = yield* storage.getAllRecords(collectionName);

          for (const record of allRecords) {
            const recordId = record.id as string;
            const { _d, _u, _a, _e, ...fields } = record;
            const content = _d ? JSON.stringify(null) : JSON.stringify(fields);
            const dTag = `${collectionName}:${recordId}`;

            const wrapResult = yield* Effect.result(
              giftWrap.wrap({
                kind: 1,
                content,
                tags: [["d", dTag]],
                created_at: Math.floor(Date.now() / 1000),
              }),
            );
            if (wrapResult._tag === "Failure") continue;

            const gw = wrapResult.success;
            yield* storage.putGiftWrap({ id: gw.id, event: gw, createdAt: gw.created_at });

            const metaKey = `gw_record:${collectionName}:${recordId}`;
            const prevMapping = (yield* storage.getMeta(metaKey).pipe(
              Effect.orElseSucceed(() => undefined),
            )) as { gwId: string; epochPubKey: string } | undefined;

            if (prevMapping) oldGwDeletions.push(prevMapping);

            const epochPubKey = gw.tags.find((t: string[]) => t[0] === "p")?.[1];
            yield* storage.putMeta(metaKey, { gwId: gw.id, epochPubKey });

            yield* relay.publish(gw, [...config.relays]).pipe(
              Effect.tapError((e) => Effect.sync(() => reportSyncError(config.onSyncError, e))),
              Effect.ignore,
            );
          }
        }

        // Batch NIP-09 deletions grouped by epoch
        const byEpoch = new Map<string, string[]>();
        for (const { gwId, epochPubKey } of oldGwDeletions) {
          const ids = byEpoch.get(epochPubKey) ?? [];
          ids.push(gwId);
          byEpoch.set(epochPubKey, ids);
        }

        for (const [epochPubKey, gwIds] of byEpoch) {
          const signingKey = getDecryptionKey(epochStore, epochPubKey);
          if (signingKey) {
            const deletionEvent = createDeletionEvent(gwIds, signingKey);
            yield* relay.publish(deletionEvent, [...config.relays]).pipe(
              Effect.tapError((e) => Effect.sync(() => reportSyncError(config.onSyncError, e))),
              Effect.ignore,
            );
          }
          for (const gwId of gwIds) {
            yield* storage.deleteGiftWrap(gwId).pipe(Effect.ignore);
          }
        }
      });

    const knownAuthors = new Set<string>();

    const putMemberRecord = (record: Record<string, unknown>) =>
      Effect.gen(function* () {
        const existing = yield* storage.getRecord("_members", record.id as string);
        const event: StoredEvent = {
          id: uuidv7(),
          collection: "_members",
          recordId: record.id as string,
          kind: existing ? "u" : "c",
          data: record,
          createdAt: Date.now(),
          author: identity.publicKey,
        };
        yield* storage.putEvent(event);
        yield* applyEvent(storage, event);
        yield* onWrite(event);
        yield* notifyChange(watchCtx, {
          collection: "_members",
          recordId: record.id as string,
          kind: existing ? "update" : "create",
        });
        config.onMembersChanged?.();
      });

    notifyAuthor = (pubkey: string) => {
      if (knownAuthors.has(pubkey)) return;
      knownAuthors.add(pubkey);

      Effect.runFork(
        Effect.gen(function* () {
          const existing = yield* storage.getRecord("_members", pubkey);
          if (!existing) {
            yield* putMemberRecord({
              id: pubkey,
              addedAt: Date.now(),
              addedInEpoch: getCurrentEpoch(epochStore).id,
            });
          }

          const profileOpt = yield* fetchAuthorProfile(relay, config.relays, pubkey).pipe(
            Effect.catchTag("RelayError", () => Effect.succeed(Option.none())),
          );
          if (Option.isSome(profileOpt)) {
            const current = yield* storage.getRecord("_members", pubkey);
            if (current) {
              yield* storage.putRecord("_members", {
                ...current,
                ...profileOpt.value,
              });
              yield* notifyChange(watchCtx, {
                collection: "_members",
                recordId: pubkey,
                kind: "update",
              });
              config.onMembersChanged?.();
            }
          }
        }).pipe(Effect.ignore, Effect.provide(logLayer), Effect.forkIn(scope)),
      );
    };

    const handles = new Map<string, AnyCollectionHandle>();
    for (const [, def] of allSchemaEntries) {
      const validator = buildValidator(def.name, def);
      const partialValidator = buildPartialValidator(def.name, def);
      const handle = createCollectionHandle(
        def,
        storage,
        watchCtx,
        validator,
        partialValidator,
        uuidv7,
        identity.publicKey,
        onWrite,
        config.logLevel,
      );
      handles.set(def.name, handle as AnyCollectionHandle);
    }

    yield* syncHandle.startSubscription();

    yield* Effect.logInfo("Tablinum ready", {
      dbName: config.dbName,
      collections: schemaEntries.map(([name]) => name),
      relays: config.relays,
    });

    const selfMember = yield* storage.getRecord("_members", identity.publicKey);
    if (!selfMember) {
      yield* putMemberRecord({
        id: identity.publicKey,
        addedAt: Date.now(),
        addedInEpoch: getCurrentEpoch(epochStore).id,
      });
    }

    // One-time migration: republish all records so that every record has
    // a gw_record meta entry and a gift wrap under the current epoch.
    const migrated = yield* storage.getMeta("migration_gw_republish").pipe(
      Effect.orElseSucceed(() => undefined),
    );
    if (!migrated) {
      yield* republishAllUnderCurrentEpoch().pipe(Effect.ignore);
      yield* storage.putMeta("migration_gw_republish", true);
    }

    const withLog = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
      Effect.provideService(effect, References.MinimumLogLevel, config.logLevel);

    const ensureOpen = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E | StorageError> =>
      withLog(
        Effect.gen(function* () {
          if (yield* Ref.get(closedRef)) {
            return yield* new StorageError({ message: "Database is closed" });
          }
          return yield* effect;
        }),
      );

    const ensureSyncOpen = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E | SyncError> =>
      withLog(
        Effect.gen(function* () {
          if (yield* Ref.get(closedRef)) {
            return yield* new SyncError({ message: "Database is closed", phase: "init" });
          }
          return yield* effect;
        }),
      );

    const dbHandle: DatabaseHandle<SchemaConfig> = {
      collection: (name) => {
        const handle = handles.get(name);
        if (!handle) throw new Error(`Collection "${name}" not found in schema`);
        return handle as any;
      },

      publicKey: identity.publicKey,
      members: handles.get("_members")! as AnyCollectionHandle,
      exportKey: () => identity.exportKey(),

      exportInvite: (): Invite => ({
        epochKeys: [...exportEpochKeys(epochStore)],
        relays: [...config.relays],
        dbName: config.dbName,
      }),

      close: () =>
        withLog(
          Effect.gen(function* () {
            if (yield* Ref.get(closedRef)) return;
            yield* Ref.set(closedRef, true);
            syncHandle.stopHealing();
            yield* Scope.close(scope, Exit.void);
          }),
        ),

      destroy: () =>
        withLog(
          Effect.gen(function* () {
            if (!(yield* Ref.get(closedRef))) {
              yield* Ref.set(closedRef, true);
              syncHandle.stopHealing();
              yield* Scope.close(scope, Exit.void);
            }
            yield* deleteIDBStorage(config.dbName);
          }),
        ),

      leave: () =>
        withLog(
          Effect.gen(function* () {
            if (yield* Ref.get(closedRef)) {
              return yield* new SyncError({ message: "Database is closed", phase: "leave" });
            }

            const allMembers = yield* storage.getAllRecords("_members");
            const activeMembers = allMembers.filter(
              (member) => !member.removedAt && member.id !== identity.publicKey,
            );
            const activePubkeys = activeMembers.map((member) => member.id as string);

            const result = createRotation(
              epochStore,
              identity.privateKey,
              identity.publicKey,
              activePubkeys,
              [identity.publicKey],
            );

            addEpoch(epochStore, result.epoch);
            epochStore.currentEpochId = result.epoch.id;
            yield* storage.putMeta("epochs", stringifyEpochStore(epochStore));

            const memberRecord = yield* storage.getRecord("_members", identity.publicKey);
            yield* putMemberRecord({
              ...(memberRecord ?? {
                id: identity.publicKey,
                addedAt: 0,
                addedInEpoch: EpochId("epoch-0"),
              }),
              removedAt: Date.now(),
              removedInEpoch: result.epoch.id,
            });

            // Re-publish all data under the new epoch before leaving
            // so remaining members' data survives if the leaving member
            // later deletes old-epoch gift wraps.
            yield* republishAllUnderCurrentEpoch();

            yield* Effect.forEach(
              result.wrappedEvents,
              (wrappedEvent) =>
                relay.publish(wrappedEvent as NostrEvent, [...config.relays]).pipe(
                  Effect.tapError((e) => Effect.sync(() => reportSyncError(config.onSyncError, e))),
                  Effect.ignore,
                ),
              { discard: true },
            );

            // Close and delete local database
            yield* Ref.set(closedRef, true);
            syncHandle.stopHealing();
            yield* Scope.close(scope, Exit.void);
            yield* deleteIDBStorage(config.dbName);
          }),
        ),

      rebuild: () =>
        ensureOpen(
          rebuildRecords(
            storage,
            allSchemaEntries.map(([, def]) => def.name),
          ),
        ),

      sync: () =>
        ensureSyncOpen(
          syncHandle.sync().pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                syncHandle.startHealing();
              }),
            ),
          ),
        ),
      getSyncStatus: () => syncStatus.get(),
      subscribeSyncStatus: (callback) => syncStatus.subscribe(callback),
      pendingCount: () => publishQueue.size(),
      subscribePendingCount: (callback) => publishQueue.subscribe(callback),
      getRelayStatus: () => relay.getStatus(),
      subscribeRelayStatus: (callback) => relay.subscribeStatus(callback),

      addMember: (pubkey) =>
        ensureOpen(
          Effect.gen(function* () {
            const existing = yield* storage.getRecord("_members", pubkey);
            if (existing && !existing.removedAt) return;
            yield* putMemberRecord({
              id: pubkey,
              addedAt: Date.now(),
              addedInEpoch: getCurrentEpoch(epochStore).id,
              ...(existing ? { removedAt: undefined, removedInEpoch: undefined } : {}),
            });
          }),
        ),

      removeMember: (pubkey) =>
        ensureOpen(
          Effect.gen(function* () {
            const allMembers = yield* storage.getAllRecords("_members");
            const activeMembers = allMembers.filter(
              (member) => !member.removedAt && member.id !== pubkey,
            );
            const activePubkeys = activeMembers.map((member) => member.id as string);

            const result = createRotation(
              epochStore,
              identity.privateKey,
              identity.publicKey,
              activePubkeys,
              [pubkey],
            );

            addEpoch(epochStore, result.epoch);
            epochStore.currentEpochId = result.epoch.id;
            yield* storage.putMeta("epochs", stringifyEpochStore(epochStore));

            const memberRecord = yield* storage.getRecord("_members", pubkey);
            yield* putMemberRecord({
              ...(memberRecord ?? {
                id: pubkey,
                addedAt: 0,
                addedInEpoch: EpochId("epoch-0"),
              }),
              removedAt: Date.now(),
              removedInEpoch: result.epoch.id,
            });

            // Re-publish all data under the new epoch so the removed member
            // cannot cause data loss by deleting old-epoch gift wraps.
            yield* republishAllUnderCurrentEpoch();

            yield* Effect.forEach(
              result.wrappedEvents,
              (wrappedEvent) =>
                relay.publish(wrappedEvent as NostrEvent, [...config.relays]).pipe(
                  Effect.tapError((e) => Effect.sync(() => reportSyncError(config.onSyncError, e))),
                  Effect.ignore,
                ),
              { discard: true },
            );
            yield* Effect.forEach(
              result.removalNotices,
              (notice) =>
                relay.publish(notice as NostrEvent, [...config.relays]).pipe(
                  Effect.tapError((e) => Effect.sync(() => reportSyncError(config.onSyncError, e))),
                  Effect.ignore,
                ),
              { discard: true },
            );

            yield* syncHandle.addEpochSubscription(result.epoch.publicKey);
          }),
        ),

      getMembers: () =>
        ensureOpen(
          Effect.gen(function* () {
            const allRecords = yield* storage.getAllRecords("_members");
            return allRecords.filter((record) => !record._d).map(mapMemberRecord);
          }),
        ),

      getProfile: () =>
        ensureOpen(
          Effect.gen(function* () {
            const record = yield* storage.getRecord("_members", identity.publicKey);
            if (!record) return {};
            const profile: Record<string, string> = {};
            if (record.name !== undefined) profile.name = record.name as string;
            if (record.picture !== undefined) profile.picture = record.picture as string;
            if (record.about !== undefined) profile.about = record.about as string;
            if (record.nip05 !== undefined) profile.nip05 = record.nip05 as string;
            return profile;
          }),
        ),

      setProfile: (profile) =>
        ensureOpen(
          Effect.gen(function* () {
            const existing = yield* storage.getRecord("_members", identity.publicKey);
            if (!existing) {
              return yield* new ValidationError({ message: "Current user is not a member" });
            }
            const { _d, _u, _a, _e, ...memberFields } = existing;
            yield* putMemberRecord({ ...memberFields, ...profile });
          }),
        ),
    };

    return dbHandle;
  }).pipe(Effect.withLogSpan("tablinum.init")),
).pipe(Layer.provide(AllServicesLive));
