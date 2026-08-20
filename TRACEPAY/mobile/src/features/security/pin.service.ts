import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { getRandomBytesAsync } from "expo-crypto";

import { secureStorage } from "../../lib/secure-storage";
import {
  PIN_KDF_ITERATIONS,
  PIN_LENGTH,
  SECURITY_STORAGE_KEYS,
} from "./security.constants";
import type { PinRecord } from "./security.types";

const DERIVED_KEY_LENGTH = 32;

function pinToBytes(pin: readonly number[]): Uint8Array {
  if (
    pin.length !== PIN_LENGTH ||
    pin.some((digit) => !Number.isInteger(digit) || digit < 0 || digit > 9)
  ) {
    throw new Error("A valid four-digit PIN is required.");
  }

  return Uint8Array.from(pin, (digit) => 48 + digit);
}

async function deriveVerifier(
  pin: readonly number[],
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const pinBytes = pinToBytes(pin);

  try {
    return await pbkdf2Async(sha256, pinBytes, salt, {
      c: iterations,
      dkLen: DERIVED_KEY_LENGTH,
      asyncTick: 8,
    });
  } finally {
    pinBytes.fill(0);
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function isPinRecord(value: unknown): value is PinRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<PinRecord>;
  return (
    record.version === 1 &&
    record.algorithm === "pbkdf2-sha256" &&
    typeof record.iterations === "number" &&
    record.iterations >= 100_000 &&
    typeof record.salt === "string" &&
    typeof record.verifier === "string"
  );
}

export async function createPinRecord(
  pin: readonly number[],
): Promise<PinRecord> {
  const salt = await getRandomBytesAsync(16);
  const verifier = await deriveVerifier(pin, salt, PIN_KDF_ITERATIONS);

  return {
    version: 1,
    algorithm: "pbkdf2-sha256",
    iterations: PIN_KDF_ITERATIONS,
    salt: bytesToHex(salt),
    verifier: bytesToHex(verifier),
  };
}

export async function verifyPinRecord(
  pin: readonly number[],
  record: PinRecord,
): Promise<boolean> {
  const expected = hexToBytes(record.verifier);
  const actual = await deriveVerifier(
    pin,
    hexToBytes(record.salt),
    record.iterations,
  );

  try {
    return constantTimeEqual(actual, expected);
  } finally {
    actual.fill(0);
    expected.fill(0);
  }
}

export async function loadPinRecord(): Promise<PinRecord | null> {
  const stored = await secureStorage.get(SECURITY_STORAGE_KEYS.pinRecord);
  if (!stored) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return isPinRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function savePinRecord(record: PinRecord): Promise<void> {
  await secureStorage.set(
    SECURITY_STORAGE_KEYS.pinRecord,
    JSON.stringify(record),
  );
}

