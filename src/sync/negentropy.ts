import { Effect } from "effect";
// @ts-expect-error -- vendored JS without types
import { Negentropy, NegentropyStorageVector } from "../vendor/negentropy.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { GiftWrap } from "nostr-tools/kinds";
import type { IDBStorageHandle } from "../storage/idb.ts";
import type { RelayHandle } from "./relay.ts";
import type { Filter } from "nostr-tools/filter";
import { SyncError, RelayError, StorageError } from "../errors.ts";

export interface ReconcileResult {
  readonly haveIds: string[];
  readonly needIds: string[];
}

export function reconcileWithRelay(
  storage: IDBStorageHandle,
  relay: RelayHandle,
  relayUrl: string,
  publicKeys: string | string[],
): Effect.Effect<ReconcileResult, SyncError | RelayError | StorageError> {
  return Effect.gen(function* () {
    const allGiftWraps = yield* storage.getAllGiftWraps();

    const storageVector = new NegentropyStorageVector();
    for (const gw of allGiftWraps) {
      storageVector.insert(gw.createdAt, hexToBytes(gw.id));
    }
    storageVector.seal();

    const neg = new Negentropy(storageVector, 0);

    const filter: Filter = {
      kinds: [GiftWrap],
      "#p": Array.isArray(publicKeys) ? publicKeys : [publicKeys],
    };

    const allHaveIds: string[] = [];
    const allNeedIds: string[] = [];
    const subId = `neg-${Date.now()}`;

    const initialMsg: string = yield* Effect.try({
      try: () => neg.initiate() as string,
      catch: (e) =>
        new SyncError({
          message: `Negentropy initiate failed: ${e instanceof Error ? e.message : String(e)}`,
          phase: "negotiate",
          cause: e,
        }),
    });

    let currentMsg: string | null = initialMsg;

    while (currentMsg !== null) {
      const response = yield* relay.sendNegMsg(relayUrl, subId, filter, currentMsg);

      if (response.msgHex === null) break;

      const reconcileResult: [string | null, string[], string[]] = yield* Effect.try({
        try: () => neg.reconcile(response.msgHex) as [string | null, string[], string[]],
        catch: (e) =>
          new SyncError({
            message: `Negentropy reconcile failed: ${e instanceof Error ? e.message : String(e)}`,
            phase: "negotiate",
            cause: e,
          }),
      });

      const [nextMsg, haveIds, needIds] = reconcileResult;
      for (const id of haveIds) allHaveIds.push(id);
      for (const id of needIds) allNeedIds.push(id);
      currentMsg = nextMsg;
    }

    yield* Effect.logDebug("Negentropy reconciliation complete", {
      relay: relayUrl,
      have: allHaveIds.length,
      need: allNeedIds.length,
    });

    return { haveIds: allHaveIds, needIds: allNeedIds };
  }).pipe(Effect.withLogSpan("tablinum.negentropy"));
}
