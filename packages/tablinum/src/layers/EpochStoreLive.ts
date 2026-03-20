import { Effect, Layer, Option } from "effect";
import { generateSecretKey } from "nostr-tools/pure";
import { bytesToHex } from "@noble/hashes/utils.js";
import { EpochStore } from "../services/EpochStore.ts";
import { Config } from "../services/Config.ts";
import { Identity } from "../services/Identity.ts";
import { Storage } from "../services/Storage.ts";
import {
  EpochId,
  createEpochStoreFromInputs,
  deserializeEpochStore,
  stringifyEpochStore,
  type EpochStore as EpochStoreShape,
} from "../db/epoch.ts";

export const EpochStoreLive = Layer.effect(
  EpochStore,
  Effect.gen(function* () {
    const config = yield* Config;
    const identity = yield* Identity;
    const storage = yield* Storage;

    // Load existing IDB epochs (if any)
    let idbStore: EpochStoreShape | undefined;
    const idbRaw = yield* storage.getMeta("epochs");
    if (typeof idbRaw === "string") {
      const parsed = deserializeEpochStore(idbRaw);
      if (Option.isSome(parsed)) {
        idbStore = parsed.value;
      }
    }

    // When config.epochKeys provided, check relationship to IDB
    if (config.epochKeys && config.epochKeys.length > 0) {
      if (idbStore) {
        // If config keys are already a subset of IDB, this is a normal restart
        // after invite (IDB may have additional rotated epochs)
        const configIsSubset = config.epochKeys.every((ek) => {
          const existing = idbStore!.epochs.get(ek.epochId);
          return existing !== undefined && existing.privateKey === ek.key;
        });

        if (configIsSubset) {
          yield* Effect.logInfo("Epoch store loaded", {
            source: "storage",
            epochs: idbStore.epochs.size,
          });
          return idbStore;
        }
      }

      // Config has new/different keys (new invite) — use them
      const store = createEpochStoreFromInputs(config.epochKeys);
      yield* storage.putMeta("epochs", stringifyEpochStore(store));
      yield* Effect.logInfo("Epoch store loaded", { source: "config", epochs: store.epochs.size });
      return store;
    }

    // No config.epochKeys — use IDB or generate
    if (idbStore) {
      yield* Effect.logInfo("Epoch store loaded", {
        source: "storage",
        epochs: idbStore.epochs.size,
      });
      return idbStore;
    }

    const store = createEpochStoreFromInputs(
      [{ epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) }],
      { createdBy: identity.publicKey },
    );
    yield* storage.putMeta("epochs", stringifyEpochStore(store));
    yield* Effect.logInfo("Epoch store loaded", { source: "generated", epochs: store.epochs.size });
    return store;
  }),
);
