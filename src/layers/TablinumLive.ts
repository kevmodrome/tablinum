import { Effect, Exit, Layer, Option, PubSub, Ref, Scope } from "effect";
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
  addEpoch,
  persistEpochs,
  stringifyEpochStore,
  exportEpochKeys,
} from "../db/epoch.ts";
import type { EpochStore as EpochStoreShape } from "../db/epoch.ts";
import { createRotation } from "../db/key-rotation.ts";
import { uuidv7 } from "../utils/uuid.ts";
import { StorageError, SyncError, ValidationError } from "../errors.ts";

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

// --- Layer dependency graph (bottom-up wiring) ---

// Tier 1: Identity and EpochStore both depend on Storage
const IdentityWithDeps = IdentityLive.pipe(Layer.provide(StorageLive));

const EpochStoreWithDeps = EpochStoreLive.pipe(
  Layer.provide(IdentityWithDeps),
  Layer.provide(StorageLive),
);

// Tier 2: GiftWrap depends on Identity + EpochStore
const GiftWrapWithDeps = GiftWrapLive.pipe(
  Layer.provide(IdentityWithDeps),
  Layer.provide(EpochStoreWithDeps),
);

// Tier 2: PublishQueue depends on Storage + Relay
const PublishQueueWithDeps = PublishQueueLive.pipe(
  Layer.provide(StorageLive),
  Layer.provide(RelayLive),
);

// All services merged (Config is the only remaining external requirement)
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

    // Shared watch context
    const pubsub = yield* PubSub.unbounded<ChangeEvent>();
    const replayingRef = yield* Ref.make(false);
    const closedRef = yield* Ref.make(false);
    const watchCtx = { pubsub, replayingRef };

    // Schema entries
    const schemaEntries = Object.entries(config.schema) as CollectionEntry[];
    const allSchemaEntries = [...schemaEntries, ["_members", membersCollectionDef] as const];

    // Late-bound author notifier (circular: sync → memberService → onWrite → sync)
    let notifyAuthor: ((pubkey: string) => void) | undefined;

    // Create sync handle
    const syncHandle: SyncHandle = createSyncHandle(
      storage,
      giftWrap,
      relay,
      publishQueue,
      syncStatus,
      watchCtx,
      config.relays,
      epochStore,
      identity.privateKey,
      identity.publicKey,
      config.dbName,
      scope,
      config.onSyncError ? (error) => reportSyncError(config.onSyncError, error) : undefined,
      (pubkey) => notifyAuthor?.(pubkey),
      config.onRemoved,
      config.onMembersChanged,
    );

    // OnWrite: gift-wrap and publish
    const onWrite: OnWriteCallback = (event) =>
      Effect.gen(function* () {
        const content =
          event.kind === "delete" ? JSON.stringify({ _deleted: true }) : JSON.stringify(event.data);
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

        yield* Effect.forkDetach(
          Effect.gen(function* () {
            const publishResult = yield* Effect.result(
              syncHandle.publishLocal({ id: gw.id, event: gw, createdAt: gw.created_at }),
            );
            if (publishResult._tag === "Failure") {
              reportSyncError(config.onSyncError, publishResult.failure);
            }
          }),
        );
      });

    // Member service
    const knownAuthors = new Set<string>();

    const putMemberRecord = (record: Record<string, unknown>) =>
      Effect.gen(function* () {
        const existing = yield* storage.getRecord("_members", record.id as string);
        const event: StoredEvent = {
          id: uuidv7(),
          collection: "_members",
          recordId: record.id as string,
          kind: existing ? "update" : "create",
          data: record,
          createdAt: Date.now(),
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
            }
          }
        }).pipe(Effect.ignore, Effect.forkIn(scope)),
      );
    };

    // Build collection handles
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
        onWrite,
      );
      handles.set(def.name, handle as AnyCollectionHandle);
    }

    // Start subscriptions
    yield* syncHandle.startSubscription();

    // Register self as member
    const selfMember = yield* storage.getRecord("_members", identity.publicKey);
    if (!selfMember) {
      yield* putMemberRecord({
        id: identity.publicKey,
        addedAt: Date.now(),
        addedInEpoch: getCurrentEpoch(epochStore).id,
      });
    }

    // Guard helpers
    const ensureOpen = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E | StorageError> =>
      Effect.gen(function* () {
        if (yield* Ref.get(closedRef)) {
          return yield* new StorageError({ message: "Database is closed" });
        }
        return yield* effect;
      });

    const ensureSyncOpen = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E | SyncError> =>
      Effect.gen(function* () {
        if (yield* Ref.get(closedRef)) {
          return yield* new SyncError({ message: "Database is closed", phase: "init" });
        }
        return yield* effect;
      });

    // Build DatabaseHandle
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
        Effect.gen(function* () {
          if (yield* Ref.get(closedRef)) return;
          yield* Ref.set(closedRef, true);
          yield* Scope.close(scope, Exit.void);
        }),

      rebuild: () =>
        ensureOpen(
          rebuildRecords(
            storage,
            allSchemaEntries.map(([, def]) => def.name),
          ),
        ),

      sync: () => ensureSyncOpen(syncHandle.sync()),
      getSyncStatus: () => syncStatus.get(),
      subscribeSyncStatus: (callback) => syncStatus.subscribe(callback),

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
            persistEpochs(epochStore, config.dbName);
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
            return allRecords.filter((record) => !record._deleted).map(mapMemberRecord);
          }),
        ),

      setProfile: (profile) =>
        ensureOpen(
          Effect.gen(function* () {
            const existing = yield* storage.getRecord("_members", identity.publicKey);
            if (!existing) {
              return yield* new ValidationError({ message: "Current user is not a member" });
            }
            yield* putMemberRecord({ ...existing, ...profile });
          }),
        ),
    };

    return dbHandle;
  }),
).pipe(Layer.provide(AllServicesLive));
