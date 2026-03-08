import { Effect, PubSub, Ref, Stream } from "effect";
import type { IDBStorageHandle, StoredRecord } from "../storage/idb.ts";
import type { StorageError } from "../errors.ts";

export interface ChangeEvent {
  readonly collection: string;
  readonly recordId: string;
  readonly kind: "create" | "update" | "delete";
}

export interface WatchContext {
  readonly pubsub: PubSub.PubSub<ChangeEvent>;
  readonly replayingRef: Ref.Ref<boolean>;
}

/**
 * Create a reactive Stream that emits the current result set whenever it changes.
 */
export function watchCollection<T>(
  ctx: WatchContext,
  storage: IDBStorageHandle,
  collectionName: string,
  filter?: (record: StoredRecord) => boolean,
  mapRecord?: (record: StoredRecord) => T,
): Stream.Stream<ReadonlyArray<T>, StorageError> {
  const query = (): Effect.Effect<ReadonlyArray<T>, StorageError> =>
    Effect.gen(function* () {
      const all = yield* storage.getAllRecords(collectionName);
      const filtered = all.filter((r) => !r.deleted && (filter ? filter(r) : true));
      return mapRecord ? filtered.map(mapRecord) : (filtered as unknown as ReadonlyArray<T>);
    });

  const changes = Stream.fromPubSub(ctx.pubsub).pipe(
    Stream.filter((event) => event.collection === collectionName),
    Stream.mapEffect(() =>
      Effect.gen(function* () {
        const replaying = yield* Ref.get(ctx.replayingRef);
        if (replaying) return undefined;
        return yield* query();
      }),
    ),
    Stream.filter((result): result is ReadonlyArray<T> => result !== undefined),
  );

  return Stream.unwrap(
    Effect.gen(function* () {
      const initial = yield* query();
      return Stream.concat(Stream.make(initial), changes);
    }),
  );
}

/**
 * Notify subscribers of a change.
 */
export function notifyChange(ctx: WatchContext, event: ChangeEvent): Effect.Effect<void> {
  return PubSub.publish(ctx.pubsub, event).pipe(Effect.asVoid);
}

/**
 * Emit a replay-complete notification for all collections that changed.
 * Call after sync replay to trigger batched watch updates.
 */
export function notifyReplayComplete(
  ctx: WatchContext,
  collections: ReadonlyArray<string>,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    yield* Ref.set(ctx.replayingRef, false);
    for (const collection of collections) {
      yield* notifyChange(ctx, {
        collection,
        recordId: "",
        kind: "update",
      });
    }
  });
}
