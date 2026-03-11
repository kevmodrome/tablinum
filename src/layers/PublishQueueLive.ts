import { Effect, Layer } from "effect";
import { PublishQueue } from "../services/PublishQueue.ts";
import { Storage } from "../services/Storage.ts";
import { Relay } from "../services/Relay.ts";
import { createPublishQueue } from "../sync/publish-queue.ts";

export const PublishQueueLive = Layer.effect(
  PublishQueue,
  Effect.gen(function* () {
    const storage = yield* Storage;
    const relay = yield* Relay;
    return yield* createPublishQueue(storage, relay);
  }),
);
