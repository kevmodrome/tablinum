import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import type { IDBStorageHandle } from "../../src/storage/idb.ts";
import type { RelayHandle } from "../../src/sync/relay.ts";
import { createPublishQueue } from "../../src/sync/publish-queue.ts";
import { StorageError } from "../../src/errors.ts";

describe("publish queue", () => {
  it.effect("fails enqueue when pending state cannot be persisted", () =>
    Effect.gen(function* () {
      const storage = {
        getMeta: () => Effect.succeed(undefined),
        putMeta: () =>
          Effect.fail(
            new StorageError({
              message: "persist failed",
            }),
          ),
      } as unknown as IDBStorageHandle;

      const relay = {} as RelayHandle;
      const queue = yield* createPublishQueue(storage, relay);
      const result = yield* Effect.result(queue.enqueue("event-1"));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("StorageError");
      }
    }),
  );
});
