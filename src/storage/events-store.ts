import { Effect } from "effect";
import type { IDBStorageHandle, StoredEvent } from "./idb.ts";
import type { StorageError } from "../errors.ts";

export function putEvent(
  storage: IDBStorageHandle,
  event: StoredEvent,
): Effect.Effect<void, StorageError> {
  return storage.putEvent(event);
}

export function getEventsByRecord(
  storage: IDBStorageHandle,
  collection: string,
  recordId: string,
): Effect.Effect<ReadonlyArray<StoredEvent>, StorageError> {
  return storage.getEventsByRecord(collection, recordId);
}

export function getAllEvents(
  storage: IDBStorageHandle,
): Effect.Effect<ReadonlyArray<StoredEvent>, StorageError> {
  return storage.getAllEvents();
}
