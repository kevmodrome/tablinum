import { Effect } from "effect";
import type { IDBStorageHandle, StoredEvent, StoredRecord } from "./idb.ts";
import { resolveWinner } from "./lww.ts";
import type { StorageError } from "../errors.ts";

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
      const record: StoredRecord = {
        id: event.recordId,
        collection: event.collection,
        data: event.data ?? {},
        deleted: event.kind === "delete",
        updatedAt: event.createdAt,
      };
      yield* storage.putRecord(record);
    }

    return incomingWon;
  });
}

/**
 * Rebuild the records store by clearing it and replaying all events.
 */
export function rebuild(storage: IDBStorageHandle): Effect.Effect<void, StorageError> {
  return Effect.gen(function* () {
    yield* storage.clearRecords();
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
      const record: StoredRecord = {
        id: event.recordId,
        collection: event.collection,
        data: event.data ?? {},
        deleted: event.kind === "delete",
        updatedAt: event.createdAt,
      };
      yield* storage.putRecord(record);
    }
  });
}
