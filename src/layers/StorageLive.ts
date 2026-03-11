import { Effect, Layer } from "effect";
import { Storage } from "../services/Storage.ts";
import { Config } from "../services/Config.ts";
import { openIDBStorage } from "../storage/idb.ts";
import { membersCollectionDef } from "../db/members.ts";

export const StorageLive = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const config = yield* Config;
    return yield* openIDBStorage(config.dbName, {
      ...config.schema,
      _members: membersCollectionDef,
    });
  }),
);
