import { it, expect } from "@effect/vitest";
import { Effect } from "effect";

it.effect("should return 42", () =>
  Effect.gen(function* () {
    const result = yield* Effect.succeed(42);
    expect(result).toBe(42);
  }),
);
