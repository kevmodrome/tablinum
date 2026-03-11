import { Layer } from "effect";
import { Relay } from "../services/Relay.ts";
import { createRelayHandle } from "../sync/relay.ts";

export const RelayLive = Layer.effect(Relay, createRelayHandle());
