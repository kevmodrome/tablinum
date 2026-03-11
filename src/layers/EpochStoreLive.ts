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
  loadPersistedEpochs,
  persistEpochs,
} from "../db/epoch.ts";

export const EpochStoreLive = Layer.effect(
  EpochStore,
  Effect.gen(function* () {
    const config = yield* Config;
    const identity = yield* Identity;
    const storage = yield* Storage;

    // Source of truth: IDB _meta store
    const idbRaw = yield* storage.getMeta("epochs");
    if (typeof idbRaw === "string") {
      const idbStore = deserializeEpochStore(idbRaw);
      if (Option.isSome(idbStore)) {
        persistEpochs(idbStore.value, config.dbName); // sync localStorage cache
        return idbStore.value;
      }
    }

    // Migrate from localStorage if present
    const persisted = loadPersistedEpochs(config.dbName);
    if (Option.isSome(persisted)) {
      yield* storage.putMeta("epochs", stringifyEpochStore(persisted.value));
      return persisted.value;
    }

    // Use config-provided epoch keys
    if (config.epochKeys && config.epochKeys.length > 0) {
      const store = createEpochStoreFromInputs(config.epochKeys);
      persistEpochs(store, config.dbName);
      yield* storage.putMeta("epochs", stringifyEpochStore(store));
      return store;
    }

    // Generate default epoch
    const store = createEpochStoreFromInputs(
      [{ epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) }],
      { createdBy: identity.publicKey },
    );
    persistEpochs(store, config.dbName);
    yield* storage.putMeta("epochs", stringifyEpochStore(store));
    return store;
  }),
);
