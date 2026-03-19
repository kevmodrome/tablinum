import { describe, expect, it, vi } from "vitest";
import { Effect, Exit, PubSub, Ref, Scope } from "effect";
import type { NostrEvent } from "nostr-tools/pure";
import { generateSecretKey } from "nostr-tools/pure";
import type { ChangeEvent } from "../../src/crud/watch.ts";
import { EpochId } from "../../src/brands.ts";
import { bytesToHex, createEpochStoreFromInputs } from "../../src/db/epoch.ts";
import type { IDBStorageHandle, StoredEvent } from "../../src/storage/idb.ts";
import type { GiftWrapHandle } from "../../src/sync/gift-wrap.ts";
import type { PublishQueueHandle } from "../../src/sync/publish-queue.ts";
import type { RelayHandle } from "../../src/sync/relay.ts";
import type { SyncStatusHandle } from "../../src/sync/sync-status.ts";
import { createSyncHandle } from "../../src/sync/sync-service.ts";
import type { ReconcileResult } from "../../src/sync/negentropy.ts";

// Mock reconcileWithRelay to bypass the vendored Negentropy protocol entirely
vi.mock("../../src/sync/negentropy.ts", () => ({
  reconcileWithRelay: (
    _storage: unknown,
    _relay: unknown,
    relayUrl: string,
    _publicKeys: unknown,
  ) => {
    const needIds = perRelayNeedIds[relayUrl] ?? [];
    return Effect.succeed({ haveIds: [], needIds } as ReconcileResult);
  },
}));

// Per-relay needIds, set by each test before calling sync()
let perRelayNeedIds: Record<string, string[]> = {};

// Nostr event IDs are 32-byte hex strings (64 chars)
function hexId(n: number): string {
  return n.toString(16).padStart(64, "0");
}

function makeGiftWrap(id: string, outerCreatedAt: number): NostrEvent {
  return {
    id,
    pubkey: "",
    created_at: outerCreatedAt,
    kind: 1059,
    tags: [],
    content: "",
    sig: "",
  };
}

function makeRumor(
  id: string,
  collection: string,
  recordId: string,
  createdAt: number,
  data: Record<string, unknown>,
) {
  return {
    id,
    pubkey: "author-1",
    created_at: createdAt,
    content: JSON.stringify(data),
    tags: [["d", `${collection}:${recordId}`]],
  };
}

function createTestHarness(opts: {
  relayUrls: string[];
  giftWrapEvents: Record<string, NostrEvent>;
  rumors: Record<string, ReturnType<typeof makeRumor>>;
}) {
  const appliedEvents: StoredEvent[] = [];
  const storedRecords = new Map<string, Record<string, unknown>>();

  const storage = {
    getGiftWrap: () => Effect.succeed(undefined),
    putGiftWrap: () => Effect.succeed(undefined),
    getAllGiftWraps: () => Effect.succeed([]),
    putEvent: (event: StoredEvent) =>
      Effect.sync(() => {
        appliedEvents.push(event);
      }),
    getRecord: (collection: string, id: string) =>
      Effect.succeed(storedRecords.get(`${collection}:${id}`)),
    putRecord: (collection: string, record: Record<string, unknown>) =>
      Effect.sync(() => {
        storedRecords.set(`${collection}:${record.id}`, record);
      }),
    getEventsByRecord: () => Effect.succeed([]),
  } as unknown as IDBStorageHandle;

  const giftWrap: GiftWrapHandle = {
    unwrap: (gw: NostrEvent) => {
      const rumor = opts.rumors[gw.id];
      if (!rumor) return Effect.fail(new Error("unknown gift wrap"));
      return Effect.succeed(rumor);
    },
    wrap: () => Effect.fail(new Error("not implemented")),
  } as unknown as GiftWrapHandle;

  const relay: RelayHandle = {
    publish: () => Effect.succeed(undefined),
    fetchEvents: (ids: readonly string[], _url: string) =>
      Effect.succeed(
        ids
          .map((id) => opts.giftWrapEvents[id])
          .filter((e): e is NostrEvent => e !== undefined),
      ),
    subscribe: () => Effect.succeed(undefined),
    sendNegMsg: () =>
      Effect.succeed({ msgHex: null, haveIds: [] as string[], needIds: [] as string[] }),
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

  return { storage, giftWrap, relay, publishQueue, syncStatus, appliedEvents, storedRecords };
}

function createSyncHandleForTest(
  harness: ReturnType<typeof createTestHarness>,
  relayUrls: string[],
  scope: Scope.Scope,
  watchCtx: { pubsub: PubSub.PubSub<ChangeEvent>; replayingRef: Ref.Ref<boolean> },
) {
  const epochStore = createEpochStoreFromInputs([
    { epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) },
  ]);
  const epochPublicKey = Array.from(epochStore.keysByPublicKey.keys())[0]!;

  return createSyncHandle(
    harness.storage,
    harness.giftWrap,
    harness.relay,
    harness.publishQueue,
    harness.syncStatus,
    watchCtx,
    relayUrls,
    new Map([["todos", 10], ["_members", 1]]),
    epochStore,
    new Uint8Array(32),
    epochPublicKey,
    scope,
    "None",
  );
}

describe("parallel relay sync", () => {
  it("applies events from multiple relays in chronological order by rumor timestamp", async () => {
    const id1 = hexId(1), id2 = hexId(2), id3 = hexId(3);

    // Gift wrap outer timestamps are deliberately reversed to test we sort by rumor time
    const harness = createTestHarness({
      relayUrls: ["wss://relay-a.example.com", "wss://relay-b.example.com"],
      giftWrapEvents: {
        [id1]: makeGiftWrap(id1, 999), // outer 999, rumor 100
        [id2]: makeGiftWrap(id2, 1),   // outer 1, rumor 200
        [id3]: makeGiftWrap(id3, 500), // outer 500, rumor 300
      },
      rumors: {
        [id1]: makeRumor("rumor-1", "todos", "rec-1", 100, { title: "first" }),
        [id2]: makeRumor("rumor-2", "todos", "rec-1", 200, { title: "second" }),
        [id3]: makeRumor("rumor-3", "todos", "rec-1", 300, { title: "third" }),
      },
    });

    // Relay A has events 1 and 3, Relay B has event 2
    perRelayNeedIds = {
      "wss://relay-a.example.com": [id1, id3],
      "wss://relay-b.example.com": [id2],
    };

    const watchCtx = {
      pubsub: await Effect.runPromise(PubSub.unbounded<ChangeEvent>()),
      replayingRef: await Effect.runPromise(Ref.make(false)),
    };
    const scope = Effect.runSync(Scope.make());

    try {
      const handle = createSyncHandleForTest(harness, [
        "wss://relay-a.example.com",
        "wss://relay-b.example.com",
      ], scope, watchCtx);

      await Effect.runPromise(handle.sync());

      // Events should be applied in rumor timestamp order: 100, 200, 300
      expect(harness.appliedEvents).toHaveLength(3);
      expect(harness.appliedEvents[0]!.id).toBe("rumor-1");
      expect(harness.appliedEvents[0]!.createdAt).toBe(100_000);
      expect(harness.appliedEvents[1]!.id).toBe("rumor-2");
      expect(harness.appliedEvents[1]!.createdAt).toBe(200_000);
      expect(harness.appliedEvents[2]!.id).toBe("rumor-3");
      expect(harness.appliedEvents[2]!.createdAt).toBe(300_000);
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });

  it("deduplicates events present on multiple relays", async () => {
    const id1 = hexId(1);

    const harness = createTestHarness({
      relayUrls: ["wss://relay-a.example.com", "wss://relay-b.example.com"],
      giftWrapEvents: { [id1]: makeGiftWrap(id1, 100) },
      rumors: { [id1]: makeRumor("rumor-1", "todos", "rec-1", 100, { title: "hello" }) },
    });

    // Same event on both relays
    perRelayNeedIds = {
      "wss://relay-a.example.com": [id1],
      "wss://relay-b.example.com": [id1],
    };

    const watchCtx = {
      pubsub: await Effect.runPromise(PubSub.unbounded<ChangeEvent>()),
      replayingRef: await Effect.runPromise(Ref.make(false)),
    };
    const scope = Effect.runSync(Scope.make());

    try {
      const handle = createSyncHandleForTest(harness, [
        "wss://relay-a.example.com",
        "wss://relay-b.example.com",
      ], scope, watchCtx);

      await Effect.runPromise(handle.sync());

      // Should only be applied once despite being on both relays
      expect(harness.appliedEvents).toHaveLength(1);
      expect(harness.appliedEvents[0]!.id).toBe("rumor-1");
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });

  it("applies diffs to the same record in correct order across relays", async () => {
    const id1 = hexId(1), id2 = hexId(2), id3 = hexId(3);

    const harness = createTestHarness({
      relayUrls: ["wss://relay-a.example.com", "wss://relay-b.example.com"],
      giftWrapEvents: {
        [id1]: makeGiftWrap(id1, 900), // outer timestamps deliberately wrong
        [id2]: makeGiftWrap(id2, 800),
        [id3]: makeGiftWrap(id3, 700),
      },
      rumors: {
        // Create: full record
        [id1]: makeRumor("rumor-1", "todos", "rec-1", 100, {
          id: "rec-1",
          title: "original",
          status: "draft",
        }),
        // Update 1 (rumor time 200): change title
        [id2]: makeRumor("rumor-2", "todos", "rec-1", 200, { title: "updated" }),
        // Update 2 (rumor time 300): change status
        [id3]: makeRumor("rumor-3", "todos", "rec-1", 300, { status: "published" }),
      },
    });

    // Relay A has the create and second update, Relay B has the first update
    perRelayNeedIds = {
      "wss://relay-a.example.com": [id1, id3],
      "wss://relay-b.example.com": [id2],
    };

    const watchCtx = {
      pubsub: await Effect.runPromise(PubSub.unbounded<ChangeEvent>()),
      replayingRef: await Effect.runPromise(Ref.make(false)),
    };
    const scope = Effect.runSync(Scope.make());

    try {
      const handle = createSyncHandleForTest(harness, [
        "wss://relay-a.example.com",
        "wss://relay-b.example.com",
      ], scope, watchCtx);

      await Effect.runPromise(handle.sync());

      // Events applied in rumor timestamp order
      expect(harness.appliedEvents).toHaveLength(3);
      expect(harness.appliedEvents[0]!.createdAt).toBe(100_000);
      expect(harness.appliedEvents[1]!.createdAt).toBe(200_000);
      expect(harness.appliedEvents[2]!.createdAt).toBe(300_000);

      // Final record should have both updates applied in order
      const record = harness.storedRecords.get("todos:rec-1");
      expect(record).toBeDefined();
      expect(record!.title).toBe("updated");
      expect(record!.status).toBe("published");
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });
});
