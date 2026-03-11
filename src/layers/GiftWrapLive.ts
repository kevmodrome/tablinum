import { Effect, Layer } from "effect";
import { GiftWrap } from "../services/GiftWrap.ts";
import { Identity } from "../services/Identity.ts";
import { EpochStore } from "../services/EpochStore.ts";
import { createEpochGiftWrapHandle } from "../sync/gift-wrap.ts";

export const GiftWrapLive = Layer.effect(
  GiftWrap,
  Effect.gen(function* () {
    const identity = yield* Identity;
    const epochStore = yield* EpochStore;
    return createEpochGiftWrapHandle(identity.privateKey, epochStore);
  }),
);
