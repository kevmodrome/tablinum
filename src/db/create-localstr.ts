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

export interface LocalstrConfig<S extends SchemaConfig> {
  readonly schema: S;
  readonly relays: readonly string[];
  readonly privateKey?: Uint8Array | undefined;
  readonly dbName?: string | undefined;
  readonly onSyncError?: ((error: unknown) => void) | undefined;
}

export function createLocalstr<S extends SchemaConfig>(
  config: LocalstrConfig<S>,
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
    const storageKeyName = `localstr-key-${config.dbName ?? "localstr"}`;
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

    const storage = yield* openIDBStorage(config.dbName);

    // Watch infrastructure
    const pubsub = yield* PubSub.unbounded<ChangeEvent>();
    const replayingRef = yield* Ref.make(false);
    const watchCtx = { pubsub, replayingRef };
    const closedRef = yield* Ref.make(false);

    // Sync infrastructure
    const giftWrapHandle = createGiftWrapHandle(identity.privateKey, identity.publicKey);
    const relayHandle = createRelayHandle();
    const publishQueue = yield* createPublishQueue(storage, relayHandle);
    const syncStatus = yield* createSyncStatusHandle();
    const syncHandle = createSyncHandle(
      storage,
      giftWrapHandle,
      relayHandle,
      publishQueue,
      syncStatus,
      watchCtx,
      config.relays,
      identity.publicKey,
      config.onSyncError,
    );

    // On local write: create gift wrap and publish asynchronously
    const onWrite: OnWriteCallback = (event) =>
      Effect.gen(function* () {
        console.log("[localstr:onWrite]", event.kind, event.collection, event.recordId);
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
          console.log(
            "[localstr:onWrite] gift wrap created:",
            gw.id,
            "kind:",
            gw.kind,
            "tags:",
            JSON.stringify(gw.tags),
          );
          yield* storage.putGiftWrap({
            id: gw.id,
            event: gw as unknown as Record<string, unknown>,
            createdAt: gw.created_at,
          });
          console.log("[localstr:onWrite] gift wrap stored, publishing...");
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
              console.error("[localstr:publish] failed:", err);
              if (config.onSyncError) config.onSyncError(err);
            } else {
              console.log("[localstr:publish] success");
            }
          });
          yield* Effect.forkDetach(publishEffect);
        } else {
          const err = wrapResult.failure;
          console.error("[localstr:onWrite] wrap failed:", err);
          if (config.onSyncError) config.onSyncError(err);
        }
      });

    // Build collection handles
    const handles = new Map<string, CollectionHandle<CollectionDef<CollectionFields>>>();

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
          yield* rebuildRecords(storage);
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
