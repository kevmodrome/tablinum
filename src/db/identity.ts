import { Effect } from "effect";
import { getPublicKey } from "nostr-tools/pure";
import { CryptoError } from "../errors.ts";

export interface Identity {
  readonly privateKey: Uint8Array;
  readonly publicKey: string;
  readonly exportKey: () => string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createIdentity(suppliedKey?: Uint8Array): Effect.Effect<Identity, CryptoError> {
  return Effect.gen(function* () {
    let privateKey: Uint8Array;

    if (suppliedKey) {
      if (suppliedKey.length !== 32) {
        return yield* new CryptoError({
          message: `Private key must be 32 bytes, got ${suppliedKey.length}`,
        });
      }
      privateKey = suppliedKey;
    } else {
      privateKey = new Uint8Array(32);
      crypto.getRandomValues(privateKey);
    }

    const privateKeyHex = bytesToHex(privateKey);

    const publicKey = yield* Effect.try({
      try: () => getPublicKey(privateKey),
      catch: (e) =>
        new CryptoError({
          message: `Failed to derive public key: ${e instanceof Error ? e.message : String(e)}`,
          cause: e,
        }),
    });

    return {
      privateKey,
      publicKey,
      exportKey: () => privateKeyHex,
    };
  });
}
