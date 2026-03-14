import { Effect, Layer } from "effect";
import { hexToBytes } from "@noble/hashes/utils.js";
import { Identity } from "../services/Identity.ts";
import { Config } from "../services/Config.ts";
import { Storage } from "../services/Storage.ts";
import { createIdentity } from "../db/identity.ts";

export const IdentityLive = Layer.effect(
  Identity,
  Effect.gen(function* () {
    const config = yield* Config;
    const storage = yield* Storage;

    const idbKey = yield* storage.getMeta("identity_key");
    const resolvedKey =
      config.privateKey ??
      (typeof idbKey === "string" && idbKey.length === 64 ? hexToBytes(idbKey) : undefined);

    const identity = yield* createIdentity(resolvedKey);
    yield* storage.putMeta("identity_key", identity.exportKey());

    yield* Effect.logInfo("Identity loaded", {
      publicKey: identity.publicKey.slice(0, 12) + "...",
      source: config.privateKey ? "config" : resolvedKey ? "storage" : "generated",
    });

    return identity;
  }),
);
