import { Effect } from "effect";
import type { IDBStorageHandle, StoredEvent } from "./idb.ts";
import { resolveWinner } from "./lww.ts";
import { deepMerge } from "../utils/diff.ts";
import type { StorageError } from "../errors.ts";

export function buildRecord(event: StoredEvent): Record<string, unknown> {
  return {
    id: event.recordId,
    _d: event.kind === "d",
    _u: event.createdAt,
    _e: event.id,
    _a: event.author,
    ...(event.data ?? {}),
  };
}

export function applyEvent(
  storage: IDBStorageHandle,
  event: StoredEvent,
): Effect.Effect<boolean, StorageError> {
  return Effect.gen(function* () {
    const existing = yield* storage.getRecord(event.collection, event.recordId);

    if (existing) {
      const existingMeta = {
        id: existing._e as string,
        createdAt: existing._u as number,
      };
      const incomingMeta = { id: event.id, createdAt: event.createdAt };
      const winner = resolveWinner(existingMeta, incomingMeta);
      if (winner.id !== event.id) return false;
    }

    if (existing && event.kind === "u") {
      yield* storage.putRecord(event.collection, deepMerge(existing, buildRecord(event)));
    } else {
      yield* storage.putRecord(event.collection, buildRecord(event));
    }
    return true;
  });
}

export function rebuild(
  storage: IDBStorageHandle,
  collections: ReadonlyArray<string>,
): Effect.Effect<void, StorageError> {
  return Effect.gen(function* () {
    for (const col of collections) {
      yield* storage.clearRecords(col);
    }
    const allEvents = yield* storage.getAllEvents();

    const sorted = [...allEvents].sort(
      (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1),
    );
    for (const event of sorted) {
      if (event.data === null && event.kind !== "d") continue;
      yield* applyEvent(storage, event);
    }
  });
}
