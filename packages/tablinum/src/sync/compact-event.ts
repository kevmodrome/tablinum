import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { NostrEvent } from "nostr-tools/pure";

// Binary layout: [version:1][pubkey:32][sig:64][recipient:32][created_at:4][content:rest]
const VERSION = 1;
const HEADER_SIZE = 133;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function packEvent(event: NostrEvent): Uint8Array {
  const pubkey = hexToBytes(event.pubkey);
  const sig = hexToBytes(event.sig);
  const recipientTag = event.tags.find((t) => t[0] === "p");
  if (!recipientTag) throw new Error("Gift wrap missing #p tag");
  if (event.tags.some((t) => t[0] !== "p")) {
    throw new Error("Gift wrap has unexpected non-p tags; compact encoding would lose them");
  }
  const recipient = hexToBytes(recipientTag[1]);
  const createdAtBuf = new Uint8Array(4);
  new DataView(createdAtBuf.buffer).setUint32(0, event.created_at, false);
  const content = base64ToBytes(event.content);

  const result = new Uint8Array(HEADER_SIZE + content.length);
  result[0] = VERSION;
  result.set(pubkey, 1);
  result.set(sig, 33);
  result.set(recipient, 97);
  result.set(createdAtBuf, 129);
  result.set(content, HEADER_SIZE);
  return result;
}

export function unpackEvent(id: string, compact: Uint8Array): NostrEvent {
  const version = compact[0];
  if (version !== VERSION) throw new Error(`Unknown compact event version: ${version}`);
  const pubkey = bytesToHex(compact.slice(1, 33));
  const sig = bytesToHex(compact.slice(33, 97));
  const recipient = bytesToHex(compact.slice(97, 129));
  const dv = new DataView(compact.buffer, compact.byteOffset + 129, 4);
  const createdAt = dv.getUint32(0, false);
  const content = bytesToBase64(compact.slice(HEADER_SIZE));

  return {
    id,
    pubkey,
    sig,
    created_at: createdAt,
    kind: 1059,
    tags: [["p", recipient]],
    content,
  };
}
