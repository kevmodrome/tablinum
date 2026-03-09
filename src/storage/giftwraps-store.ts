import { Effect } from "effect";
import type { IDBStorageHandle, StoredGiftWrap } from "./idb.ts";
import type { StorageError } from "../errors.ts";

export function putGiftWrap(
  storage: IDBStorageHandle,
  gw: StoredGiftWrap,
): Effect.Effect<void, StorageError> {
  return storage.putGiftWrap(gw);
}

export function getGiftWrap(
  storage: IDBStorageHandle,
  id: string,
): Effect.Effect<StoredGiftWrap | undefined, StorageError> {
  return storage.getGiftWrap(id);
}

export function getAllGiftWraps(
  storage: IDBStorageHandle,
): Effect.Effect<ReadonlyArray<StoredGiftWrap>, StorageError> {
  return storage.getAllGiftWraps();
}
