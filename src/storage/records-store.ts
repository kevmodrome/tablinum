import { Effect } from "effect";
import type { IDBStorageHandle, StoredEvent } from "./idb.ts";
import { resolveWinner } from "./lww.ts";
import type { StorageError } from "../errors.ts";

/**
 * Build a flat record from an event for storage in per-collection IDB stores.
 */
function buildRecord(event: StoredEvent): Record<string, unknown> {
  return {
    id: event.recordId,
    _deleted: event.kind === "delete",
    _updatedAt: event.createdAt,
    _eventId: event.id,
    _author: event.author,
    ...(event.data ?? {}),
  };
}

/**
 * Apply an event to the records store using LWW resolution.
 * Compares the incoming event directly against the materialized record (O(1))
 * instead of reading all events for the record.
 * Returns true if the incoming event won and the record was updated.
 */
export function applyEvent(
  storage: IDBStorageHandle,
  event: StoredEvent,
): Effect.Effect<boolean, StorageError> {
  return Effect.gen(function* () {
    const existing = yield* storage.getRecord(event.collection, event.recordId);

    if (existing) {
      const existingMeta = {
        id: existing._eventId as string,
        createdAt: existing._updatedAt as number,
      };
      const incomingMeta = { id: event.id, createdAt: event.createdAt };
      const winner = resolveWinner(existingMeta, incomingMeta);
      if (winner.id !== event.id) return false;
    }

    yield* storage.putRecord(event.collection, buildRecord(event));
    return true;
  });
}

/**
 * Rebuild the records store by clearing it and replaying all events.
 */
export function rebuild(
  storage: IDBStorageHandle,
  collections: ReadonlyArray<string>,
): Effect.Effect<void, StorageError> {
  return Effect.gen(function* () {
    for (const col of collections) {
      yield* storage.clearRecords(col);
    }
    const allEvents = yield* storage.getAllEvents();

    // Sort by createdAt for deterministic replay
    const sorted = [...allEvents].sort((a, b) => a.createdAt - b.createdAt);

    // Group events by record and resolve each
    const winners = new Map<string, StoredEvent>();
    for (const event of sorted) {
      const key = `${event.collection}:${event.recordId}`;
      const current = winners.get(key) ?? null;
      winners.set(key, resolveWinner(current, event));
    }

    // Write winning records
    for (const event of winners.values()) {
      yield* storage.putRecord(event.collection, buildRecord(event));
    }
  });
}
