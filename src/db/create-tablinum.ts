import { Effect, PubSub, Ref, Scope } from "effect";
import type { CollectionFields } from "../schema/collection.ts";
import type { CollectionDef } from "../schema/collection.ts";
import type { SchemaConfig } from "../schema/types.ts";
import { buildValidator, buildPartialValidator } from "../schema/validate.ts";
import { openIDBStorage } from "../storage/idb.ts";
import { rebuild as rebuildRecords } from "../storage/records-store.ts";
import {
  createCollectionHandle,
  type CollectionHandle,
  type OnWriteCallback,
} from "../crud/collection-handle.ts";
import type { ChangeEvent } from "../crud/watch.ts";
import { createIdentity } from "./identity.ts";
import type { DatabaseHandle } from "./database-handle.ts";
import { createGiftWrapHandle } from "../sync/gift-wrap.ts";
import { createRelayHandle } from "../sync/relay.ts";
import { createPublishQueue } from "../sync/publish-queue.ts";
import { createSyncStatusHandle } from "../sync/sync-status.ts";
import { createSyncHandle } from "../sync/sync-service.ts";
import { CryptoError, StorageError, SyncError, ValidationError } from "../errors.ts";
import { uuidv7 } from "../utils/uuid.ts";
import { getPublicKey } from "nostr-tools/pure";
import { authorsCollectionDef, fetchAuthorProfile } from "./authors.ts";
import type { Invite } from "./invite.ts";

export interface TablinumConfig<S extends SchemaConfig> {
  readonly schema: S;
  readonly relays: readonly string[];
  readonly privateKey?: Uint8Array | undefined;
  readonly groupPrivateKey?: Uint8Array | undefined;
  readonly dbName?: string | undefined;
  readonly onSyncError?: ((error: Error) => void) | undefined;
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

    // Resolve private key: supplied > persisted > generate new
    let resolvedKey = config.privateKey;
    const storageKeyName = `tablinum-key-${config.dbName ?? "tablinum"}`;
    if (!resolvedKey && typeof globalThis.localStorage !== "undefined") {
      const saved = globalThis.localStorage.getItem(storageKeyName);
      if (saved && saved.length === 64) {
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          bytes[i] = parseInt(saved.slice(i * 2, i * 2 + 2), 16);
        }
        resolvedKey = bytes;
      }
    }

    const identity = yield* createIdentity(resolvedKey);

    // Persist the key for next session
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(storageKeyName, identity.exportKey());
    }

    // Resolve group key: supplied > persisted > none (single-user mode)
    let resolvedGroupKey = config.groupPrivateKey;
    const groupKeyName = `tablinum-group-key-${config.dbName ?? "tablinum"}`;
    if (!resolvedGroupKey && typeof globalThis.localStorage !== "undefined") {
      const saved = globalThis.localStorage.getItem(groupKeyName);
      if (saved && saved.length === 64) {
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          bytes[i] = parseInt(saved.slice(i * 2, i * 2 + 2), 16);
        }
        resolvedGroupKey = bytes;
      }
    }

    // Persist group key for next session
    if (resolvedGroupKey && typeof globalThis.localStorage !== "undefined") {
      const hex = Array.from(resolvedGroupKey, (b) => b.toString(16).padStart(2, "0")).join("");
      globalThis.localStorage.setItem(groupKeyName, hex);
    }

    // Derive encryption target: group pubkey (multi-user) or own pubkey (single-user)
    const targetPublicKey = resolvedGroupKey ? getPublicKey(resolvedGroupKey) : identity.publicKey;
    const decryptionKey = resolvedGroupKey ?? identity.privateKey;

    // Inject _authors into schema for IDB storage
    const augmentedSchema: SchemaConfig = {
      ...config.schema,
      _authors: authorsCollectionDef,
    };

    const storage = yield* openIDBStorage(config.dbName, augmentedSchema);

    // Watch infrastructure
    const pubsub = yield* PubSub.unbounded<ChangeEvent>();
    const replayingRef = yield* Ref.make(false);
    const watchCtx = { pubsub, replayingRef };
    const closedRef = yield* Ref.make(false);

    // Sync infrastructure
    const giftWrapHandle = createGiftWrapHandle(
      identity.privateKey,
      targetPublicKey,
      decryptionKey,
    );
    const relayHandle = createRelayHandle();
    const publishQueue = yield* createPublishQueue(storage, relayHandle);
    const syncStatus = yield* createSyncStatusHandle();

    // Track known authors to avoid redundant Kind 0 fetches
    const knownAuthors = new Set<string>();

    const onNewAuthor = (pubkey: string) => {
      if (knownAuthors.has(pubkey)) return;
      knownAuthors.add(pubkey);

      // Fire-and-forget: fetch Kind 0 profile and write to _authors
      Effect.runFork(
        Effect.gen(function* () {
          const existing = yield* storage.getRecord("_authors", pubkey);
          if (existing) return;

          const profile = yield* Effect.result(
            fetchAuthorProfile(relayHandle, config.relays, pubkey),
          );
          if (profile._tag === "Success" && profile.success) {
            yield* storage.putRecord("_authors", {
              id: pubkey,
              ...profile.success,
            });
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
      targetPublicKey,
      config.onSyncError,
      onNewAuthor,
    );

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
          if (config.onSyncError) config.onSyncError(err);
        }
      });

    // Build collection handles (user schema + _authors)
    const handles = new Map<string, CollectionHandle<CollectionDef<CollectionFields>>>();
    const allSchemaEntries = [...schemaEntries, ["_authors", authorsCollectionDef] as const];

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

    const dbHandle: DatabaseHandle<S> = {
      collection: <K extends string & keyof S>(name: K) => {
        const handle = handles.get(name);
        if (!handle) {
          throw new Error(`Collection "${name}" not found in schema`);
        }
        return handle as unknown as CollectionHandle<S[K]>;
      },

      exportKey: () => identity.exportKey(),

      exportInvite: (): Invite => {
        const groupKey = resolvedGroupKey
          ? Array.from(resolvedGroupKey, (b) => b.toString(16).padStart(2, "0")).join("")
          : identity.exportKey();
        return {
          groupKey,
          relays: [...config.relays],
          dbName: config.dbName ?? "tablinum",
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
    };

    return dbHandle;
  });
}
