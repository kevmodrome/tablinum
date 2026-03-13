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
} from "../db/epoch.ts";

export const EpochStoreLive = Layer.effect(
  EpochStore,
  Effect.gen(function* () {
    const config = yield* Config;
    const identity = yield* Identity;
    const storage = yield* Storage;

    const idbRaw = yield* storage.getMeta("epochs");
    if (typeof idbRaw === "string") {
      const idbStore = deserializeEpochStore(idbRaw);
      if (Option.isSome(idbStore)) {
        yield* Effect.logInfo("Epoch store loaded", { source: "storage", epochs: idbStore.value.epochs.size });
        return idbStore.value;
      }
    }

    if (config.epochKeys && config.epochKeys.length > 0) {
      const store = createEpochStoreFromInputs(config.epochKeys);
      yield* storage.putMeta("epochs", stringifyEpochStore(store));
      yield* Effect.logInfo("Epoch store loaded", { source: "config", epochs: store.epochs.size });
      return store;
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
