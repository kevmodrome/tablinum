import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { createIdentity } from "../../src/db/identity.ts";

describe("identity", () => {
  it.effect("generates a random key", () =>
    Effect.gen(function* () {
      const identity = yield* createIdentity();
      expect(identity.privateKey.length).toBe(32);
      expect(identity.exportKey().length).toBe(64);
    }),
  );

  it.effect("accepts a supplied key", () =>
    Effect.gen(function* () {
      const key = new Uint8Array(32);
      key.fill(1);
      const identity = yield* createIdentity(key);
      expect(identity.privateKey).toBe(key);
      expect(identity.exportKey()).toBe(
        "0101010101010101010101010101010101010101010101010101010101010101",
      );
    }),
  );

  it.effect("rejects invalid key length", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(createIdentity(new Uint8Array(16)));
      expect(result._tag).toBe("Failure");
    }),
  );
});
