import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from "expo-crypto";

import { secureStorage } from "../lib/secure-storage";

const KEY_STORAGE_KEY = "tracepay.ingestion.body_key.v1";
const CIPHERTEXT_PREFIX = "enc:v1:";

let cachedKey: AESEncryptionKey | null = null;

async function loadOrCreateKey(): Promise<AESEncryptionKey> {
  if (cachedKey) {
    return cachedKey;
  }

  const stored = await secureStorage.get(KEY_STORAGE_KEY);
  if (stored) {
    cachedKey = await AESEncryptionKey.import(stored, "base64");
    return cachedKey;
  }

  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  await secureStorage.set(KEY_STORAGE_KEY, await key.encoded("base64"));
  cachedKey = key;
  return key;
}

/** AES-GCM encrypt for short-lived local queue payloads. Empty input stays empty. */
export async function encrypt(value: string): Promise<string> {
  if (!value) {
    return value;
  }

  const key = await loadOrCreateKey();
  const sealed = await aesEncryptAsync(new TextEncoder().encode(value), key);
  const combined = await sealed.combined("base64");
  return `${CIPHERTEXT_PREFIX}${combined}`;
}

/** Decrypt queue payloads. Legacy plaintext rows (no prefix) pass through until wiped. */
export async function decrypt(value: string): Promise<string> {
  if (!value.startsWith(CIPHERTEXT_PREFIX)) {
    return value;
  }

  const key = await loadOrCreateKey();
  const sealed = AESSealedData.fromCombined(value.slice(CIPHERTEXT_PREFIX.length));
  const bytes = await aesDecryptAsync(sealed, key, { output: "bytes" });
  return new TextDecoder().decode(bytes as Uint8Array);
}
