import { ServiceMap } from "effect";
import type { RelayHandle } from "../sync/relay.ts";

export class Relay extends ServiceMap.Service<Relay, RelayHandle>()("tablinum/Relay") {}
