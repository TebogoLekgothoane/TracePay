import { getRandomBytesAsync } from "expo-crypto";

import { credentialStorage } from "../../lib/secure-storage";
import {
  INITIAL_PIN_ATTEMPTS,
  parsePinAttempts,
  type PinAttemptState,
} from "./pin-attempts";
import { createPinRecordWithSalt, isPinRecord } from "./pin.crypto";
import { SECURITY_STORAGE_KEYS } from "./security.constants";
import type { PinRecord } from "./security.types";

export { pinDigitsMatch, verifyPinRecord } from "./pin.crypto";

export async function createPinRecord(
  pin: readonly number[],
  userId: string | null,
): Promise<PinRecord> {
  const salt = await getRandomBytesAsync(16);
  return createPinRecordWithSalt(pin, salt, userId);
}

export async function loadPinRecord(): Promise<PinRecord | null> {
  const stored = await credentialStorage.get(SECURITY_STORAGE_KEYS.pinRecord);
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
  await credentialStorage.set(
    SECURITY_STORAGE_KEYS.pinRecord,
    JSON.stringify(record),
  );
}

export async function clearPinRecord(): Promise<void> {
  await credentialStorage.remove(SECURITY_STORAGE_KEYS.pinRecord);
}

export async function loadPinAttempts(): Promise<PinAttemptState> {
  return parsePinAttempts(
    await credentialStorage.get(SECURITY_STORAGE_KEYS.pinAttempts),
  );
}

export async function savePinAttempts(state: PinAttemptState): Promise<void> {
  if (state.failures === 0 && state.lockedUntil === null) {
    await credentialStorage.remove(SECURITY_STORAGE_KEYS.pinAttempts);
    return;
  }
  await credentialStorage.set(
    SECURITY_STORAGE_KEYS.pinAttempts,
    JSON.stringify(state),
  );
}

export async function clearPinAttempts(): Promise<void> {
  await savePinAttempts(INITIAL_PIN_ATTEMPTS);
}

export async function clearLegacyPendingPin(): Promise<void> {
  await credentialStorage.remove(SECURITY_STORAGE_KEYS.legacyPendingPin);
}
