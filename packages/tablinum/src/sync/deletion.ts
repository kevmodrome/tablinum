import { finalizeEvent } from "nostr-tools/pure";
import type { NostrEvent } from "nostr-tools/pure";

/**
 * Creates a NIP-09 deletion request (kind 5) for one or more events.
 *
 * For gift wraps (kind 1059), NIP-59 specifies that relays SHOULD honor
 * deletions where the signer's pubkey matches the gift wrap's p-tag.
 * This means the epoch key holder can delete any gift wrap addressed
 * to that epoch — regardless of who originally created it.
 */
export function createDeletionEvent(
  targetEventIds: readonly string[],
  signingKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(
    {
      kind: 5,
      content: "",
      tags: targetEventIds.map((id) => ["e", id]),
      created_at: Math.floor(Date.now() / 1000),
    },
    signingKey,
  ) as unknown as NostrEvent;
}
