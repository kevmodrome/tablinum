import { ServiceMap } from "effect";
import type { PublishQueueHandle } from "../sync/publish-queue.ts";

export class PublishQueue extends ServiceMap.Service<PublishQueue, PublishQueueHandle>()(
  "tablinum/PublishQueue",
) {}
