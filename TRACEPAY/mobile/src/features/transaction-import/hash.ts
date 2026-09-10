import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";

export function hashText(value: string): string {
  return bytesToHex(sha256(utf8ToBytes(value)));
}
