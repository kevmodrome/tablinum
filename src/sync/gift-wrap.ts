import { Effect } from "effect";
import { wrapEvent, unwrapEvent, type Rumor } from "nostr-tools/nip59";
import type { NostrEvent, UnsignedEvent } from "nostr-tools/pure";
import { CryptoError } from "../errors.ts";

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
