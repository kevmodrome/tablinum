import { ServiceMap } from "effect";
import type { Identity as IdentityShape } from "../db/identity.ts";

export class Identity extends ServiceMap.Service<Identity, IdentityShape>()("tablinum/Identity") {}
