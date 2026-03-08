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
    ...(event.data ?? {}),
  };
}

/**
 * Apply an event to the records store using LWW resolution.
 * Returns true if the incoming event won and the record was updated.
 */
export function applyEvent(
  storage: IDBStorageHandle,
  event: StoredEvent,
): Effect.Effect<boolean, StorageError> {
  return Effect.gen(function* () {
    const existingEvents = yield* storage.getEventsByRecord(event.collection, event.recordId);

    // Find the current winning event for this record
    let currentWinner: StoredEvent | null = null;
    for (const e of existingEvents) {
      if (e.id === event.id) continue; // Skip the event we're applying
      currentWinner = resolveWinner(currentWinner, e);
    }

    const winner = resolveWinner(currentWinner, event);
    const incomingWon = winner.id === event.id;

    if (incomingWon) {
      yield* storage.putRecord(event.collection, buildRecord(event));
    }

    return incomingWon;
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
