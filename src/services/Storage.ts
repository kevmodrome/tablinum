import { ServiceMap } from "effect";
import type { IDBStorageHandle } from "../storage/idb.ts";

export class Storage extends ServiceMap.Service<Storage, IDBStorageHandle>()("tablinum/Storage") {}
