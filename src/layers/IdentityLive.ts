import { Effect, Layer } from "effect";
import { hexToBytes } from "@noble/hashes/utils.js";
import { Identity } from "../services/Identity.ts";
import { Config } from "../services/Config.ts";
import { Storage } from "../services/Storage.ts";
import { createIdentity } from "../db/identity.ts";

function readStoredHex(key: string): string | undefined {
  if (typeof globalThis.localStorage === "undefined") return undefined;
  return globalThis.localStorage.getItem(key) ?? undefined;
}

function writeStoredValue(key: string, value: string): void {
  if (typeof globalThis.localStorage === "undefined") return;
  globalThis.localStorage.setItem(key, value);
}

function resolveStoredKey(key: string): Uint8Array | undefined {
  const saved = readStoredHex(key);
  return saved && saved.length === 64 ? hexToBytes(saved) : undefined;
}

export const IdentityLive = Layer.effect(
  Identity,
  Effect.gen(function* () {
    const config = yield* Config;
    const storage = yield* Storage;
    const storageKeyName = `tablinum-key-${config.dbName}`;

    // Source of truth: IDB _meta store
    const idbKey = yield* storage.getMeta("identity_key");
    const resolvedKey =
      config.privateKey ??
      (typeof idbKey === "string" && idbKey.length === 64 ? hexToBytes(idbKey) : undefined) ??
      resolveStoredKey(storageKeyName);

    const identity = yield* createIdentity(resolvedKey);
    const exportedKey = identity.exportKey();

    // Write to IDB (source of truth) and localStorage (cache)
    yield* storage.putMeta("identity_key", exportedKey);
    writeStoredValue(storageKeyName, exportedKey);

    return identity;
  }),
);
