import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect, PubSub, Ref } from "effect";
import type { ChangeEvent } from "../../src/crud/watch.ts";
import { createCollectionHandle } from "../../src/crud/collection-handle.ts";
import { DatabaseName } from "../../src/brands.ts";
import { collection } from "../../src/schema/collection.ts";
import { field } from "../../src/schema/field.ts";
import { buildPartialValidator, buildValidator } from "../../src/schema/validate.ts";
import { openIDBStorage } from "../../src/storage/idb.ts";

describe("collection handle", () => {
  it.effect("stores the local author on locally created events", () =>
    Effect.gen(function* () {
      const def = collection("todos", {
        title: field.string(),
      });
      const storage = yield* openIDBStorage(DatabaseName("test-collection-local-author"), {
        todos: def,
      });
      const watchCtx = {
        pubsub: yield* PubSub.unbounded<ChangeEvent>(),
        replayingRef: yield* Ref.make(false),
      };
      const handle = createCollectionHandle(
        def,
        storage,
        watchCtx,
        buildValidator(def.name, def),
        buildPartialValidator(def.name, def),
        () => "event-1",
        "local-pubkey",
      );

      const id = yield* handle.add({ title: "Test" } as any);
      const record = yield* storage.getRecord("todos", id);
      const event = yield* storage.getEvent("event-1");

      expect(record?._a).toBe("local-pubkey");
      expect(event?.author).toBe("local-pubkey");
    }),
  );
});
