import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { PIN_KDF_ITERATIONS, PIN_LENGTH } from "./security.constants";
import type { PinRecord } from "./security.types";

const DERIVED_KEY_LENGTH = 32;
const MIN_ITERATIONS = 40_000;

export function isValidPin(pin: readonly number[]): boolean {
  return (
    pin.length === PIN_LENGTH &&
    pin.every((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)
  );
}

function pinToBytes(pin: readonly number[]): Uint8Array {
  if (!isValidPin(pin)) {
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
      asyncTick: 25,
    });
  } finally {
    pinBytes.fill(0);
  }
}

function constantTimeEqual(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function isPinRecord(value: unknown): value is PinRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<PinRecord>;
  return (
    record.version === 1 &&
    record.algorithm === "pbkdf2-sha256" &&
    typeof record.iterations === "number" &&
    record.iterations >= MIN_ITERATIONS &&
    typeof record.salt === "string" &&
    record.salt.length >= 32 &&
    typeof record.verifier === "string" &&
    record.verifier.length === DERIVED_KEY_LENGTH * 2 &&
    (record.userId === undefined ||
      record.userId === null ||
      typeof record.userId === "string")
  );
}

export async function createPinRecordWithSalt(
  pin: readonly number[],
  salt: Uint8Array,
  userId: string | null,
): Promise<PinRecord> {
  const verifier = await deriveVerifier(pin, salt, PIN_KDF_ITERATIONS);

  return {
    version: 1,
    algorithm: "pbkdf2-sha256",
    iterations: PIN_KDF_ITERATIONS,
    salt: bytesToHex(salt),
    verifier: bytesToHex(verifier),
    userId,
  };
}

export async function verifyPinRecord(
  pin: readonly number[],
  record: PinRecord,
): Promise<boolean> {
  if (!isValidPin(pin) || !isPinRecord(record)) {
    return false;
  }

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

export function pinDigitsMatch(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return constantTimeEqual(left, right);
}
