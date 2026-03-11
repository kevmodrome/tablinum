import { ServiceMap } from "effect";
import type { GiftWrapHandle } from "../sync/gift-wrap.ts";

export class GiftWrap extends ServiceMap.Service<GiftWrap, GiftWrapHandle>()("tablinum/GiftWrap") {}
