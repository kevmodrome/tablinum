import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { resolveRuntimeConfig } from "../../src/db/runtime-config.ts";

describe("resolveRuntimeConfig", () => {
  it("applies defaults and round-trips key material", () => {
    const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const config = Effect.runSync(
      resolveRuntimeConfig({
        relays: ["wss://relay.example.com"],
        privateKey,
      }),
    );

    expect(config.dbName).toBe("tablinum");
    expect(config.relays).toEqual(["wss://relay.example.com"]);
    expect(config.privateKey).toEqual(privateKey);
  });

  it("accepts explicit undefined optional fields", () => {
    const config = Effect.runSync(
      resolveRuntimeConfig({
        relays: ["wss://relay.example.com"],
        dbName: undefined,
        privateKey: undefined,
        epochKeys: undefined,
      }),
    );

    expect(config.dbName).toBe("tablinum");
    expect(config.epochKeys).toBeUndefined();
  });

  it("rejects empty relay configuration", () => {
    const result = Effect.runSync(
      Effect.result(
        resolveRuntimeConfig({
          relays: [],
        }),
      ),
    );

    expect(result._tag).toBe("Failure");
  });
});
