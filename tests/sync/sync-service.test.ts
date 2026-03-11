import { describe, expect, it } from "vitest";
import { Effect, Exit, PubSub, Ref, Scope } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import { generateSecretKey } from "nostr-tools/pure";
import type { ChangeEvent } from "../../src/crud/watch.ts";
import { EpochId } from "../../src/brands.ts";
import { bytesToHex, createEpochStoreFromInputs } from "../../src/db/epoch.ts";
import type { IDBStorageHandle, StoredGiftWrap } from "../../src/storage/idb.ts";
import type { GiftWrapHandle } from "../../src/sync/gift-wrap.ts";
import type { PublishQueueHandle } from "../../src/sync/publish-queue.ts";
import type { RelayHandle } from "../../src/sync/relay.ts";
import type { SyncStatusHandle } from "../../src/sync/sync-status.ts";
import { createSyncHandle } from "../../src/sync/sync-service.ts";

describe("sync service", () => {
  it("ignores unknown collection gift wraps before persisting events", async () => {
    const watchCtx = {
      pubsub: await Effect.runPromise(PubSub.unbounded<ChangeEvent>()),
      replayingRef: await Effect.runPromise(Ref.make(false)),
    };
    const scope = Effect.runSync(Scope.make());

    let subscribed: ((event: NostrEvent) => void) | undefined;
    const seenGiftWraps: StoredGiftWrap[] = [];
    let putEventCount = 0;

    const storage = {
      getGiftWrap: () => Effect.succeed(undefined),
      putGiftWrap: (gw: StoredGiftWrap) =>
        Effect.sync(() => {
          seenGiftWraps.push(gw);
        }),
      putEvent: () =>
        Effect.sync(() => {
          putEventCount++;
        }),
      getRecord: () => Effect.succeed(undefined),
    } as unknown as IDBStorageHandle;

    const giftWrap = {
      unwrap: () =>
        Effect.succeed({
          id: "rumor-1",
          pubkey: "author",
          created_at: 1,
          content: JSON.stringify({ title: "ignored" }),
          tags: [["d", "unknown:record-1"]],
        }),
    } as unknown as GiftWrapHandle;

    const relay = {
      publish: () => Effect.succeed(undefined),
      fetchEvents: () => Effect.succeed([] as NostrEvent[]),
      subscribe: (_filter: unknown, _url: string, onEvent: (event: NostrEvent) => void) =>
        Effect.sync(() => {
          subscribed = onEvent;
        }),
    } as unknown as RelayHandle;

    const publishQueue = {
      enqueue: () => Effect.succeed(undefined),
      flush: () => Effect.succeed(undefined),
      size: () => Effect.succeed(0),
    } as unknown as PublishQueueHandle;

    const syncStatus = {
      get: () => Effect.succeed("idle" as const),
      set: () => Effect.succeed(undefined),
    } as unknown as SyncStatusHandle;

    const epochStore = createEpochStoreFromInputs([
      { epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) },
    ]);
    const epochPublicKey = Array.from(epochStore.keysByPublicKey.keys())[0]!;

    try {
      const handle = createSyncHandle(
        storage,
        giftWrap,
        relay,
        publishQueue,
        syncStatus,
        watchCtx,
        ["wss://relay.example.com"],
        new Set(["todos", "_members"]),
        epochStore,
        new Uint8Array(32),
        epochPublicKey,
        scope,
      );

      await Effect.runPromise(handle.startSubscription());
      expect(subscribed).toBeDefined();
      subscribed!({ id: "gw-1", created_at: 1, tags: [] } as NostrEvent);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(putEventCount).toBe(0);
      expect(seenGiftWraps).toEqual([{ id: "gw-1", createdAt: 1 }]);
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });
});
