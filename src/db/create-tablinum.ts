import { Effect, Exit, Option, PubSub, Ref, Scope } from "effect";
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
import type { Identity } from "./identity.ts";
import type { DatabaseHandle } from "./database-handle.ts";
import { createEpochGiftWrapHandle } from "../sync/gift-wrap.ts";
import { createRelayHandle } from "../sync/relay.ts";
import { createPublishQueue } from "../sync/publish-queue.ts";
import { createSyncStatusHandle } from "../sync/sync-status.ts";
import { createSyncHandle, type SyncHandle } from "../sync/sync-service.ts";
import { CryptoError, StorageError, SyncError, ValidationError } from "../errors.ts";
import { uuidv7 } from "../utils/uuid.ts";
import { generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { membersCollectionDef, fetchAuthorProfile } from "./members.ts";
import type { MemberRecord } from "./members.ts";
import type { Invite } from "./invite.ts";
import type { IDBStorageHandle, StoredEvent } from "../storage/idb.ts";
import type { RelayHandle } from "../sync/relay.ts";
import type { PublishQueueHandle } from "../sync/publish-queue.ts";
import type { SyncStatusHandle } from "../sync/sync-status.ts";
import {
  createEpochStoreFromInputs,
  addEpoch,
  getCurrentEpoch,
  persistEpochs,
  loadPersistedEpochs,
  exportEpochKeys,
  bytesToHex,
  hexToBytes,
  type EpochStore,
  type EpochKeyInput,
} from "./epoch.ts";
import { createRotation } from "./key-rotation.ts";
import { resolveRuntimeConfig, type ResolvedRuntimeConfig } from "./runtime-config.ts";

export interface TablinumConfig<S extends SchemaConfig> {
  readonly schema: S;
  readonly relays: readonly string[];
  readonly privateKey?: Uint8Array | undefined;
  readonly epochKeys?: ReadonlyArray<EpochKeyInput> | undefined;
  readonly dbName?: string | undefined;
  readonly onSyncError?: ((error: Error) => void) | undefined;
  readonly onRemoved?: ((info: { epochId: string; removedBy: string }) => void) | undefined;
  readonly onMembersChanged?: (() => void) | undefined;
}

type AnyCollectionHandle = CollectionHandle<CollectionDef<CollectionFields>>;
type CollectionEntry = readonly [string, CollectionDef<CollectionFields>];

interface BootstrapState {
  readonly dbNameResolved: string;
  readonly identity: Identity;
  readonly epochStore: EpochStore;
}

interface RuntimeContext {
  readonly runtimeScope: Scope.Scope;
  readonly storage: IDBStorageHandle;
  readonly watchCtx: {
    readonly pubsub: PubSub.PubSub<ChangeEvent>;
    readonly replayingRef: Ref.Ref<boolean>;
  };
  readonly closedRef: Ref.Ref<boolean>;
  readonly relayHandle: RelayHandle;
  readonly publishQueue: PublishQueueHandle;
  readonly syncStatus: SyncStatusHandle;
}

interface MemberWriterContext {
  readonly storage: RuntimeContext["storage"];
  readonly watchCtx: RuntimeContext["watchCtx"];
  readonly epochStore: EpochStore;
  readonly onWrite: OnWriteCallback;
  readonly onMembersChanged?: (() => void) | undefined;
}

interface MemberService {
  readonly putMemberRecord: (record: Record<string, unknown>) => Effect.Effect<void, StorageError>;
  readonly onNewAuthor: (pubkey: string) => void;
}

interface HandleBuildContext {
  readonly schemaEntries: ReadonlyArray<CollectionEntry>;
  readonly storage: RuntimeContext["storage"];
  readonly watchCtx: RuntimeContext["watchCtx"];
  readonly onWrite: OnWriteCallback;
}

function validateConfig<S extends SchemaConfig>(
  config: TablinumConfig<S>,
): Effect.Effect<void, ValidationError> {
  return Effect.gen(function* () {
    if (Object.keys(config.schema).length === 0) {
      return yield* new ValidationError({
        message: "Schema must contain at least one collection",
      });
    }
  });
}

function readStoredHex(key: string): string | undefined {
  if (typeof globalThis.localStorage === "undefined") return undefined;
  return globalThis.localStorage.getItem(key) ?? undefined;
}

function writeStoredValue(key: string, value: string): void {
  if (typeof globalThis.localStorage === "undefined") return;
  globalThis.localStorage.setItem(key, value);
}

function reportSyncError(onSyncError: ((error: Error) => void) | undefined, error: unknown): void {
  if (!onSyncError) return;
  onSyncError(error instanceof Error ? error : new Error(String(error)));
}

function resolveStoredKey(key: string): Uint8Array | undefined {
  const saved = readStoredHex(key);
  return saved && saved.length === 64 ? hexToBytes(saved) : undefined;
}

function resolveBootstrapState(
  config: ResolvedRuntimeConfig,
): Effect.Effect<BootstrapState, CryptoError> {
  return Effect.gen(function* () {
    const dbNameResolved = config.dbName;
    const storageKeyName = `tablinum-key-${dbNameResolved}`;

    const resolvedKey = config.privateKey ?? resolveStoredKey(storageKeyName);
    const identity = yield* createIdentity(resolvedKey);
    writeStoredValue(storageKeyName, identity.exportKey());
    const epochStore = resolveEpochStore(config, dbNameResolved, identity);

    return {
      dbNameResolved,
      identity,
      epochStore,
    };
  });
}

function resolveEpochStore(
  config: ResolvedRuntimeConfig,
  dbNameResolved: string,
  identity: Identity,
): EpochStore {
  const persisted = loadPersistedEpochs(dbNameResolved);
  if (Option.isSome(persisted)) {
    return persisted.value;
  }

  if (config.epochKeys && config.epochKeys.length > 0) {
    const epochStore = createEpochStoreFromInputs(config.epochKeys);
    persistEpochs(epochStore, dbNameResolved);
    return epochStore;
  }

  const epochStore = createEpochStoreFromInputs(
    [{ epochId: "epoch-0", key: bytesToHex(generateSecretKey()) }],
    { createdBy: identity.publicKey },
  );
  persistEpochs(epochStore, dbNameResolved);
  return epochStore;
}

function createRuntimeContext(
  runtimeScope: Scope.Scope,
  dbNameResolved: string,
  schema: SchemaConfig,
): Effect.Effect<RuntimeContext, StorageError, Scope.Scope> {
  return Effect.gen(function* () {
    const storage = yield* openIDBStorage(dbNameResolved, schema).pipe(
      Effect.provideService(Scope.Scope, runtimeScope),
    );
    const relayHandle = yield* createRelayHandle().pipe(
      Effect.provideService(Scope.Scope, runtimeScope),
    );
    const [pubsub, replayingRef, closedRef, publishQueue, syncStatus] = yield* Effect.all([
      PubSub.unbounded<ChangeEvent>(),
      Ref.make(false),
      Ref.make(false),
      createPublishQueue(storage, relayHandle),
      createSyncStatusHandle(),
    ]);

    return {
      runtimeScope,
      storage,
      watchCtx: { pubsub, replayingRef },
      closedRef,
      relayHandle,
      publishQueue,
      syncStatus,
    };
  });
}

function createOnWrite(
  storage: RuntimeContext["storage"],
  giftWrapHandle: ReturnType<typeof createEpochGiftWrapHandle>,
  publishLocal: SyncHandle["publishLocal"],
  onSyncError?: ((error: Error) => void) | undefined,
): OnWriteCallback {
  return (event) =>
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

      if (wrapResult._tag === "Failure") {
        reportSyncError(onSyncError, wrapResult.failure);
        return;
      }

      const gw = wrapResult.success;
      yield* storage.putGiftWrap({
        id: gw.id,
        event: gw,
        createdAt: gw.created_at,
      });

      yield* Effect.forkDetach(
        Effect.gen(function* () {
          const publishResult = yield* Effect.result(
            publishLocal({
              id: gw.id,
              event: gw,
              createdAt: gw.created_at,
            }),
          );
          if (publishResult._tag === "Failure") {
            reportSyncError(onSyncError, publishResult.failure);
          }
        }),
      );
    });
}

function createMemberService(
  context: MemberWriterContext,
  relayHandle: RuntimeContext["relayHandle"],
  relayUrls: readonly string[],
  scope: Scope.Scope,
): MemberService {
  const knownAuthors = new Set<string>();

  const putMemberRecord = (record: Record<string, unknown>) =>
    Effect.gen(function* () {
      const existing = yield* context.storage.getRecord("_members", record.id as string);
      const event: StoredEvent = {
        id: uuidv7(),
        collection: "_members",
        recordId: record.id as string,
        kind: existing ? "update" : "create",
        data: record,
        createdAt: Date.now(),
      };
      yield* context.storage.putEvent(event);
      yield* applyEvent(context.storage, event);
      yield* context.onWrite(event);
      yield* notifyChange(context.watchCtx, {
        collection: "_members",
        recordId: record.id as string,
        kind: existing ? "update" : "create",
      });
      context.onMembersChanged?.();
    });

  const onNewAuthor = (pubkey: string) => {
    if (knownAuthors.has(pubkey)) return;
    knownAuthors.add(pubkey);

    Effect.runFork(
      Effect.gen(function* () {
        const existing = yield* context.storage.getRecord("_members", pubkey);

        if (!existing) {
          yield* putMemberRecord({
            id: pubkey,
            addedAt: Date.now(),
            addedInEpoch: getCurrentEpoch(context.epochStore).id,
          });
        }

        const profileOpt = yield* fetchAuthorProfile(relayHandle, relayUrls, pubkey).pipe(
          Effect.catchTag("RelayError", () => Effect.succeed(Option.none())),
        );
        if (Option.isSome(profileOpt)) {
          const current = yield* context.storage.getRecord("_members", pubkey);
          if (current) {
            yield* context.storage.putRecord("_members", {
              ...current,
              ...profileOpt.value,
            });
          }
        }
      }).pipe(Effect.ignore, Effect.forkIn(scope)),
    );
  };

  return { putMemberRecord, onNewAuthor };
}

function buildCollectionHandles({
  schemaEntries,
  storage,
  watchCtx,
  onWrite,
}: HandleBuildContext): Map<string, AnyCollectionHandle> {
  const handles = new Map<string, AnyCollectionHandle>();

  for (const [, def] of schemaEntries) {
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

  return handles;
}

function mapMemberRecord(record: Record<string, unknown>): MemberRecord {
  return {
    id: record.id as string,
    addedAt: record.addedAt as number,
    addedInEpoch: record.addedInEpoch as string,
    ...(record.name !== undefined ? { name: record.name as string } : {}),
    ...(record.picture !== undefined ? { picture: record.picture as string } : {}),
    ...(record.about !== undefined ? { about: record.about as string } : {}),
    ...(record.nip05 !== undefined ? { nip05: record.nip05 as string } : {}),
    ...(record.removedAt !== undefined ? { removedAt: record.removedAt as number } : {}),
    ...(record.removedInEpoch !== undefined
      ? { removedInEpoch: record.removedInEpoch as string }
      : {}),
  };
}

function createDatabaseHandle<S extends SchemaConfig>(args: {
  readonly runtimeConfig: ResolvedRuntimeConfig;
  readonly dbNameResolved: string;
  readonly schemaEntries: ReadonlyArray<CollectionEntry>;
  readonly identity: Identity;
  readonly epochStore: EpochStore;
  readonly runtime: RuntimeContext;
  readonly handles: Map<string, AnyCollectionHandle>;
  readonly syncHandle: SyncHandle;
  readonly putMemberRecord: MemberService["putMemberRecord"];
  readonly onSyncError?: ((error: Error) => void) | undefined;
}): DatabaseHandle<S> {
  const {
    runtimeConfig,
    dbNameResolved,
    schemaEntries,
    identity,
    epochStore,
    runtime,
    handles,
    syncHandle,
    putMemberRecord,
    onSyncError,
  } = args;

  const ensureStorageOpen = <A, E>(
    effect: Effect.Effect<A, E>,
  ): Effect.Effect<A, E | StorageError> =>
    Effect.gen(function* () {
      const closed = yield* Ref.get(runtime.closedRef);
      if (closed) {
        return yield* new StorageError({ message: "Database is closed" });
      }
      return yield* effect;
    });

  const ensureSyncOpen = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E | SyncError> =>
    Effect.gen(function* () {
      const closed = yield* Ref.get(runtime.closedRef);
      if (closed) {
        return yield* new SyncError({ message: "Database is closed", phase: "init" });
      }
      return yield* effect;
    });

  return {
    collection: <K extends string & keyof S>(name: K) => {
      const handle = handles.get(name);
      if (!handle) {
        throw new Error(`Collection "${name}" not found in schema`);
      }
      return handle as unknown as CollectionHandle<S[K]>;
    },

    publicKey: identity.publicKey,

    members: handles.get("_members")! as AnyCollectionHandle,

    exportKey: () => identity.exportKey(),

    exportInvite: (): Invite => {
      return {
        epochKeys: [...exportEpochKeys(epochStore)],
        relays: [...runtimeConfig.relays],
        dbName: dbNameResolved,
      };
    },

    close: () =>
      Effect.gen(function* () {
        const closed = yield* Ref.get(runtime.closedRef);
        if (closed) return;
        yield* Ref.set(runtime.closedRef, true);
        yield* Scope.close(runtime.runtimeScope, Exit.void);
      }),

    rebuild: () =>
      ensureStorageOpen(
        rebuildRecords(
          runtime.storage,
          schemaEntries.map(([, def]) => def.name),
        ),
      ),

    sync: () => ensureSyncOpen(syncHandle.sync()),

    getSyncStatus: () => runtime.syncStatus.get(),

    addMember: (pubkey: string) =>
      ensureStorageOpen(
        Effect.gen(function* () {
          const existing = yield* runtime.storage.getRecord("_members", pubkey);
          if (existing && !existing.removedAt) return;

          yield* putMemberRecord({
            id: pubkey,
            addedAt: Date.now(),
            addedInEpoch: getCurrentEpoch(epochStore).id,
            ...(existing ? { removedAt: undefined, removedInEpoch: undefined } : {}),
          });
        }),
      ),

    removeMember: (pubkey: string) =>
      ensureStorageOpen(
        Effect.gen(function* () {
          const allMembers = yield* runtime.storage.getAllRecords("_members");
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
          persistEpochs(epochStore, dbNameResolved);

          const memberRecord = yield* runtime.storage.getRecord("_members", pubkey);
          yield* putMemberRecord({
            ...(memberRecord ?? { id: pubkey, addedAt: 0, addedInEpoch: "epoch-0" }),
            removedAt: Date.now(),
            removedInEpoch: result.epoch.id,
          });

          yield* Effect.forEach(
            result.wrappedEvents,
            (wrappedEvent) =>
              runtime.relayHandle
                .publish(wrappedEvent as NostrEvent, [...runtimeConfig.relays])
                .pipe(
                  Effect.tapError((e) => Effect.sync(() => reportSyncError(onSyncError, e))),
                  Effect.ignore,
                ),
            { discard: true },
          );
          yield* Effect.forEach(
            result.removalNotices,
            (notice) =>
              runtime.relayHandle.publish(notice as NostrEvent, [...runtimeConfig.relays]).pipe(
                Effect.tapError((e) => Effect.sync(() => reportSyncError(onSyncError, e))),
                Effect.ignore,
              ),
            { discard: true },
          );

          yield* syncHandle.addEpochSubscription(result.epoch.publicKey);
        }),
      ),

    getMembers: () =>
      ensureStorageOpen(
        Effect.gen(function* () {
          const allRecords = yield* runtime.storage.getAllRecords("_members");
          return allRecords.filter((record) => !record._deleted).map(mapMemberRecord);
        }),
      ),

    setProfile: (profile) =>
      ensureStorageOpen(
        Effect.gen(function* () {
          const existing = yield* runtime.storage.getRecord("_members", identity.publicKey);
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
      ),
  };
}

export function createTablinum<S extends SchemaConfig>(
  config: TablinumConfig<S>,
): Effect.Effect<DatabaseHandle<S>, ValidationError | StorageError | CryptoError, Scope.Scope> {
  return Effect.gen(function* () {
    yield* validateConfig(config);
    const runtimeConfig = yield* resolveRuntimeConfig(config);

    const schemaEntries = Object.entries(config.schema) as CollectionEntry[];
    const { dbNameResolved, identity, epochStore } = yield* resolveBootstrapState(runtimeConfig);

    const runtimeScope = yield* Scope.make();
    yield* Effect.addFinalizer((exit) => Scope.close(runtimeScope, exit));
    const runtime = yield* createRuntimeContext(runtimeScope, dbNameResolved, {
      ...config.schema,
      _members: membersCollectionDef,
    });
    const giftWrapHandle = createEpochGiftWrapHandle(identity.privateKey, epochStore);
    let notifyAuthor: ((pubkey: string) => void) | undefined;
    const syncHandle = createSyncHandle(
      runtime.storage,
      giftWrapHandle,
      runtime.relayHandle,
      runtime.publishQueue,
      runtime.syncStatus,
      runtime.watchCtx,
      runtimeConfig.relays,
      epochStore,
      identity.privateKey,
      identity.publicKey,
      dbNameResolved,
      runtime.runtimeScope,
      config.onSyncError ? (error) => reportSyncError(config.onSyncError, error) : undefined,
      (pubkey) => notifyAuthor?.(pubkey),
      config.onRemoved,
      config.onMembersChanged,
    );
    const onWrite = createOnWrite(
      runtime.storage,
      giftWrapHandle,
      syncHandle.publishLocal,
      config.onSyncError,
    );
    const memberService = createMemberService(
      {
        storage: runtime.storage,
        watchCtx: runtime.watchCtx,
        epochStore,
        onWrite,
        onMembersChanged: config.onMembersChanged,
      },
      runtime.relayHandle,
      runtimeConfig.relays,
      runtime.runtimeScope,
    );
    notifyAuthor = memberService.onNewAuthor;
    const allSchemaEntries = [...schemaEntries, ["_members", membersCollectionDef] as const];
    const handles = buildCollectionHandles({
      schemaEntries: allSchemaEntries,
      storage: runtime.storage,
      watchCtx: runtime.watchCtx,
      onWrite,
    });

    yield* syncHandle.startSubscription();

    const selfMember = yield* runtime.storage.getRecord("_members", identity.publicKey);
    if (!selfMember) {
      yield* memberService.putMemberRecord({
        id: identity.publicKey,
        addedAt: Date.now(),
        addedInEpoch: getCurrentEpoch(epochStore).id,
      });
    }

    return createDatabaseHandle({
      runtimeConfig,
      dbNameResolved,
      schemaEntries: allSchemaEntries,
      identity,
      epochStore,
      runtime,
      handles,
      syncHandle,
      putMemberRecord: memberService.putMemberRecord,
      onSyncError: config.onSyncError,
    });
  });
}
