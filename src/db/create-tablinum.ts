import { Effect, PubSub, Ref, Scope } from "effect";
import type { CollectionFields } from "../schema/collection.ts";
import type { CollectionDef } from "../schema/collection.ts";
import type { SchemaConfig } from "../schema/types.ts";
import { buildValidator, buildPartialValidator } from "../schema/validate.ts";
import { openIDBStorage } from "../storage/idb.ts";
import { rebuild as rebuildRecords, applyEvent } from "../storage/records-store.ts";
import {
  createCollectionHandle,
  type CollectionHandle,
  type OnWriteCallback,
} from "../crud/collection-handle.ts";
import type { ChangeEvent } from "../crud/watch.ts";
import { notifyChange } from "../crud/watch.ts";
import { createIdentity } from "./identity.ts";
import type { DatabaseHandle } from "./database-handle.ts";
import { createEpochGiftWrapHandle } from "../sync/gift-wrap.ts";
import { createRelayHandle } from "../sync/relay.ts";
import { createPublishQueue } from "../sync/publish-queue.ts";
import { createSyncStatusHandle } from "../sync/sync-status.ts";
import { createSyncHandle } from "../sync/sync-service.ts";
import { CryptoError, StorageError, SyncError, ValidationError } from "../errors.ts";
import { uuidv7 } from "../utils/uuid.ts";
import { generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { membersCollectionDef, fetchAuthorProfile } from "./members.ts";
import type { MemberRecord } from "./members.ts";
import type { Invite } from "./invite.ts";
import type { StoredEvent } from "../storage/idb.ts";
import {
  createEpochKey,
  createEpochStore,
  addEpoch,
  getCurrentEpoch,
  persistEpochs,
  loadPersistedEpochs,
  bytesToHex,
  hexToBytes,
  type EpochStore,
} from "./epoch.ts";
import { createRotation } from "./key-rotation.ts";

export interface TablinumConfig<S extends SchemaConfig> {
  readonly schema: S;
  readonly relays: readonly string[];
  readonly privateKey?: Uint8Array | undefined;
  readonly groupPrivateKey?: Uint8Array | undefined;
  readonly epochKeys?:
    | ReadonlyArray<{ readonly epochId: string; readonly key: string }>
    | undefined;
  readonly dbName?: string | undefined;
  readonly onSyncError?: ((error: Error) => void) | undefined;
  readonly onRemoved?: ((info: { epochId: string; removedBy: string }) => void) | undefined;
  readonly onMembersChanged?: (() => void) | undefined;
}

export function createTablinum<S extends SchemaConfig>(
  config: TablinumConfig<S>,
): Effect.Effect<DatabaseHandle<S>, ValidationError | StorageError | CryptoError, Scope.Scope> {
  return Effect.gen(function* () {
    if (!config.relays || config.relays.length === 0) {
      return yield* new ValidationError({
        message: "At least one relay URL is required",
      });
    }

    const schemaEntries = Object.entries(config.schema);
    if (schemaEntries.length === 0) {
      return yield* new ValidationError({
        message: "Schema must contain at least one collection",
      });
    }

    const dbNameResolved = config.dbName ?? "tablinum";

    // Resolve private key: supplied > persisted > generate new
    let resolvedKey = config.privateKey;
    const storageKeyName = `tablinum-key-${dbNameResolved}`;
    if (!resolvedKey && typeof globalThis.localStorage !== "undefined") {
      const saved = globalThis.localStorage.getItem(storageKeyName);
      if (saved && saved.length === 64) {
        resolvedKey = hexToBytes(saved);
      }
    }

    const identity = yield* createIdentity(resolvedKey);

    // Persist the key for next session
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(storageKeyName, identity.exportKey());
    }

    // Resolve group key: supplied > persisted > auto-generate
    let resolvedGroupKey = config.groupPrivateKey;
    const groupKeyName = `tablinum-group-key-${dbNameResolved}`;
    if (!resolvedGroupKey && !config.epochKeys && typeof globalThis.localStorage !== "undefined") {
      const saved = globalThis.localStorage.getItem(groupKeyName);
      if (saved && saved.length === 64) {
        resolvedGroupKey = hexToBytes(saved);
      }
    }

    // Persist group key for next session
    if (resolvedGroupKey && typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(groupKeyName, bytesToHex(resolvedGroupKey));
    }

    // Build epoch store (always created — single-user is just multi-user with one member)
    let epochStore: EpochStore;

    const persisted = loadPersistedEpochs(dbNameResolved);
    if (persisted && persisted.epochs.length > 0) {
      epochStore = createEpochStore(persisted.epochs[0]);
      for (let i = 1; i < persisted.epochs.length; i++) {
        addEpoch(epochStore, persisted.epochs[i]);
      }
      epochStore.currentEpochId = persisted.currentEpochId;
    } else if (config.epochKeys && config.epochKeys.length > 0) {
      const firstKey = config.epochKeys[0];
      const epoch0 = createEpochKey(firstKey.epochId, firstKey.key, Date.now(), "");
      epochStore = createEpochStore(epoch0);
      for (let i = 1; i < config.epochKeys.length; i++) {
        const ek = config.epochKeys[i];
        addEpoch(epochStore, createEpochKey(ek.epochId, ek.key, Date.now(), ""));
      }
      epochStore.currentEpochId = config.epochKeys[config.epochKeys.length - 1].epochId;
      persistEpochs(epochStore, dbNameResolved);
    } else {
      const groupKey = resolvedGroupKey ?? generateSecretKey();
      if (!resolvedGroupKey && typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.setItem(groupKeyName, bytesToHex(groupKey));
      }
      const groupKeyHex = bytesToHex(groupKey);
      const epoch0 = createEpochKey("epoch-0", groupKeyHex, Date.now(), identity.publicKey);
      epochStore = createEpochStore(epoch0);
      persistEpochs(epochStore, dbNameResolved);
    }

    // Derive gift wrap handle
    const giftWrapHandle = createEpochGiftWrapHandle(identity.privateKey, epochStore);

    // Inject _members into schema for IDB storage
    const augmentedSchema: SchemaConfig = {
      ...config.schema,
      _members: membersCollectionDef,
    };

    const storage = yield* openIDBStorage(dbNameResolved, augmentedSchema);

    // Watch infrastructure
    const pubsub = yield* PubSub.unbounded<ChangeEvent>();
    const replayingRef = yield* Ref.make(false);
    const watchCtx = { pubsub, replayingRef };
    const closedRef = yield* Ref.make(false);

    // Sync infrastructure
    const relayHandle = createRelayHandle();
    const publishQueue = yield* createPublishQueue(storage, relayHandle);
    const syncStatus = yield* createSyncStatusHandle();

    // Track known authors to avoid redundant Kind 0 fetches
    const knownAuthors = new Set<string>();

    // On local write: create gift wrap and publish asynchronously
    const onWrite: OnWriteCallback = (event) =>
      Effect.gen(function* () {
        const content =
          event.kind === "delete" ? JSON.stringify({ _deleted: true }) : JSON.stringify(event.data);
        const dTag = `${event.collection}:${event.recordId}`;

        const wrapResult = yield* Effect.result(
          giftWrapHandle.wrap({
            kind: 1,
            content,
            tags: [["d", dTag]],
            created_at: Math.floor(event.createdAt / 1000),
          }),
        );

        if (wrapResult._tag === "Success") {
          const gw = wrapResult.success;
          yield* storage.putGiftWrap({
            id: gw.id,
            event: gw as unknown as Record<string, unknown>,
            createdAt: gw.created_at,
          });
          const publishEffect = Effect.gen(function* () {
            const pubResult = yield* Effect.result(
              syncHandle.publishLocal({
                id: gw.id,
                event: gw as unknown as Record<string, unknown>,
                createdAt: gw.created_at,
              }),
            );
            if (pubResult._tag === "Failure") {
              const err = pubResult.failure;
              if (config.onSyncError) config.onSyncError(err);
            }
          });
          yield* Effect.forkDetach(publishEffect);
        } else {
          const err = wrapResult.failure;
          if (config.onSyncError)
            config.onSyncError(err instanceof Error ? err : new Error(String(err)));
        }
      });

    // Helper to write a member record with a specific ID and sync via gift wrap
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
        if (config.onMembersChanged) config.onMembersChanged();
      });

    const onNewAuthor = (pubkey: string) => {
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

          // Fetch Kind 0 profile
          const profile = yield* Effect.result(
            fetchAuthorProfile(relayHandle, config.relays, pubkey),
          );
          if (profile._tag === "Success" && profile.success) {
            const current = yield* storage.getRecord("_members", pubkey);
            if (current) {
              yield* storage.putRecord("_members", {
                ...current,
                ...profile.success,
              });
            }
          }
        }),
      );
    };

    const syncHandle = createSyncHandle(
      storage,
      giftWrapHandle,
      relayHandle,
      publishQueue,
      syncStatus,
      watchCtx,
      config.relays,
      epochStore,
      identity.privateKey,
      identity.publicKey,
      dbNameResolved,
      config.onSyncError,
      onNewAuthor,
      config.onRemoved,
      config.onMembersChanged,
    );

    // Build collection handles (user schema + _members)
    const handles = new Map<string, CollectionHandle<CollectionDef<CollectionFields>>>();
    const allSchemaEntries = [...schemaEntries, ["_members", membersCollectionDef] as const];

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
      handles.set(def.name, handle as CollectionHandle<CollectionDef<CollectionFields>>);
    }

    // Start real-time subscription to incoming gift wraps
    yield* syncHandle.startSubscription();

    // Ensure current user is registered as a member
    const selfMember = yield* storage.getRecord("_members", identity.publicKey);
    if (!selfMember) {
      yield* putMemberRecord({
        id: identity.publicKey,
        addedAt: Date.now(),
        addedInEpoch: getCurrentEpoch(epochStore).id,
      });
    }

    const dbHandle: DatabaseHandle<S> = {
      collection: <K extends string & keyof S>(name: K) => {
        const handle = handles.get(name);
        if (!handle) {
          throw new Error(`Collection "${name}" not found in schema`);
        }
        return handle as unknown as CollectionHandle<S[K]>;
      },

      publicKey: identity.publicKey,

      members: handles.get("_members")! as CollectionHandle<CollectionDef<CollectionFields>>,

      exportKey: () => identity.exportKey(),

      exportInvite: (): Invite => {
        const epochKeys = Array.from(epochStore.epochs.values())
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((e) => ({ epochId: e.id, key: e.privateKey }));
        return {
          epochKeys,
          relays: [...config.relays],
          dbName: dbNameResolved,
        };
      },

      close: () =>
        Effect.gen(function* () {
          yield* Ref.set(closedRef, true);
          yield* relayHandle.closeAll();
          yield* storage.close();
        }),

      rebuild: () =>
        Effect.gen(function* () {
          const closed = yield* Ref.get(closedRef);
          if (closed) {
            return yield* new StorageError({ message: "Database is closed" });
          }
          yield* rebuildRecords(
            storage,
            allSchemaEntries.map(([, def]) => def.name),
          );
        }),

      sync: () =>
        Effect.gen(function* () {
          const closed = yield* Ref.get(closedRef);
          if (closed) {
            return yield* new SyncError({ message: "Database is closed", phase: "init" });
          }
          yield* syncHandle.sync();
        }),

      getSyncStatus: () => syncStatus.get(),

      addMember: (pubkey: string) =>
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

      removeMember: (pubkey: string) =>
        Effect.gen(function* () {
          // Get all active members
          const allMembers = yield* storage.getAllRecords("_members");
          const activeMembers = allMembers.filter((m) => !m.removedAt && m.id !== pubkey);
          const activePubkeys = activeMembers.map((m) => m.id as string);

          // Create rotation
          const result = createRotation(
            epochStore,
            identity.privateKey,
            identity.publicKey,
            activePubkeys,
            [pubkey],
          );

          // Add new epoch
          addEpoch(epochStore, result.epoch);
          epochStore.currentEpochId = result.epoch.id;
          persistEpochs(epochStore, dbNameResolved);

          // Mark member as removed
          const memberRecord = yield* storage.getRecord("_members", pubkey);
          yield* putMemberRecord({
            ...(memberRecord ?? { id: pubkey, addedAt: 0, addedInEpoch: "epoch-0" }),
            removedAt: Date.now(),
            removedInEpoch: result.epoch.id,
          });

          // Publish rotation events to remaining members
          for (const wrappedEvent of result.wrappedEvents) {
            yield* Effect.result(
              relayHandle.publish(wrappedEvent as unknown as NostrEvent, [...config.relays]),
            );
          }

          // Notify removed members
          for (const notice of result.removalNotices) {
            yield* Effect.result(
              relayHandle.publish(notice as unknown as NostrEvent, [...config.relays]),
            );
          }

          // Subscribe to new epoch key
          yield* syncHandle.addEpochSubscription(result.epoch.publicKey);
        }),

      getMembers: () =>
        Effect.gen(function* () {
          const allRecords = yield* storage.getAllRecords("_members");
          return allRecords
            .filter((r) => !r._deleted)
            .map(
              (r) =>
                ({
                  id: r.id as string,
                  name: r.name as string | undefined,
                  picture: r.picture as string | undefined,
                  about: r.about as string | undefined,
                  nip05: r.nip05 as string | undefined,
                  addedAt: r.addedAt as number,
                  addedInEpoch: r.addedInEpoch as string,
                  removedAt: r.removedAt as number | undefined,
                  removedInEpoch: r.removedInEpoch as string | undefined,
                }) as MemberRecord,
            );
        }),

      setProfile: (profile) =>
        Effect.gen(function* () {
          const existing = yield* storage.getRecord("_members", identity.publicKey);
          if (!existing) {
            return yield* new ValidationError({
              message: "Current user is not a member",
            });
          }
          yield* putMemberRecord({
            ...existing,
            ...profile,
          });
        }),
    };

    return dbHandle;
  });
}
