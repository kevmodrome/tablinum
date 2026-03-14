import { ServiceMap } from "effect";
import type { EpochStore as EpochStoreShape } from "../db/epoch.ts";

export class EpochStore extends ServiceMap.Service<EpochStore, EpochStoreShape>()(
  "tablinum/EpochStore",
) {}
