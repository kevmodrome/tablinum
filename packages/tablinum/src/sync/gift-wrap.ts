import { Effect } from "effect";
import { wrapEvent, unwrapEvent } from "nostr-tools/nip59";
import type { NostrEvent, UnsignedEvent } from "nostr-tools/pure";
import { CryptoError } from "../errors.ts";
import type { EpochStore } from "../db/epoch.ts";
import { getCurrentPublicKey, getDecryptionKey } from "../db/epoch.ts";

export type Rumor = ReturnType<typeof unwrapEvent>;

export interface GiftWrapHandle {
  readonly wrap: (rumor: Partial<UnsignedEvent>) => Effect.Effect<NostrEvent, CryptoError>;
  readonly unwrap: (giftWrap: NostrEvent) => Effect.Effect<Rumor, CryptoError>;
}

export function createGiftWrapHandle(
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
  decryptionPrivateKey: Uint8Array,
): GiftWrapHandle {
  return {
    wrap: (rumor) =>
      Effect.try({
        try: () => wrapEvent(rumor, senderPrivateKey, recipientPublicKey),
        catch: (e) =>
          new CryptoError({
            message: `Gift wrap failed: ${e instanceof Error ? e.message : String(e)}`,
            cause: e,
          }),
      }),

    unwrap: (giftWrap) =>
      Effect.try({
        try: () => unwrapEvent(giftWrap, decryptionPrivateKey),
        catch: (e) =>
          new CryptoError({
            message: `Gift unwrap failed: ${e instanceof Error ? e.message : String(e)}`,
            cause: e,
          }),
      }),
  };
}

export function createEpochGiftWrapHandle(
  senderPrivateKey: Uint8Array,
  epochStore: EpochStore,
): GiftWrapHandle {
  return {
    wrap: (rumor) =>
      Effect.try({
        try: () => wrapEvent(rumor, senderPrivateKey, getCurrentPublicKey(epochStore)),
        catch: (e) =>
          new CryptoError({
            message: `Gift wrap failed: ${e instanceof Error ? e.message : String(e)}`,
            cause: e,
          }),
      }),

    unwrap: (giftWrap) =>
      Effect.gen(function* () {
        const pTag = giftWrap.tags.find((t: string[]) => t[0] === "p")?.[1];
        if (!pTag) {
          return yield* new CryptoError({ message: "Gift wrap missing #p tag" });
        }

        const decKey = getDecryptionKey(epochStore, pTag);
        if (!decKey) {
          return yield* new CryptoError({
            message: `No epoch key for public key ${pTag.slice(0, 8)}...`,
          });
        }

        return yield* Effect.try({
          try: () => unwrapEvent(giftWrap, decKey),
          catch: (e) =>
            new CryptoError({
              message: `Gift unwrap failed: ${e instanceof Error ? e.message : String(e)}`,
              cause: e,
            }),
        });
      }),
  };
}
