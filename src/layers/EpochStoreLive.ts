import { Effect, Layer, Option } from "effect";
import { generateSecretKey } from "nostr-tools/pure";
import { bytesToHex } from "@noble/hashes/utils.js";
import { EpochStore } from "../services/EpochStore.ts";
import { Config } from "../services/Config.ts";
import { Identity } from "../services/Identity.ts";
import {
  EpochId,
  createEpochStoreFromInputs,
  loadPersistedEpochs,
  persistEpochs,
} from "../db/epoch.ts";

export const EpochStoreLive = Layer.effect(
  EpochStore,
  Effect.gen(function* () {
    const config = yield* Config;
    const identity = yield* Identity;

    const persisted = loadPersistedEpochs(config.dbName);
    if (Option.isSome(persisted)) {
      return persisted.value;
    }

    if (config.epochKeys && config.epochKeys.length > 0) {
      const store = createEpochStoreFromInputs(config.epochKeys);
      persistEpochs(store, config.dbName);
      return store;
    }

    const store = createEpochStoreFromInputs(
      [{ epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) }],
      { createdBy: identity.publicKey },
    );
    persistEpochs(store, config.dbName);
    return store;
  }),
);
