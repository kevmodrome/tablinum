import { Effect, Layer } from "effect";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { Identity } from "../services/Identity.ts";
import { Config } from "../services/Config.ts";
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
    const storageKeyName = `tablinum-key-${config.dbName}`;
    const resolvedKey = config.privateKey ?? resolveStoredKey(storageKeyName);
    const identity = yield* createIdentity(resolvedKey);
    writeStoredValue(storageKeyName, identity.exportKey());
    return identity;
  }),
);
