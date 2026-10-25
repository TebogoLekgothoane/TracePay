import { getRandomBytesAsync } from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { credentialStorage } from "../../lib/secure-storage";
import {
  biometricUnavailableMessage,
  resolveBiometricAvailability,
} from "./biometric.policy";
import { SECURITY_STORAGE_KEYS } from "./security.constants";
import type {
  BiometricAvailability,
  BiometricEnableResult,
  BiometricUnlockResult,
} from "./security.types";

/**
 * Biometric unlock is bound to a random secret stored behind OS access
 * control (iOS Keychain `.biometryCurrentSet`; Android Keystore key with
 * user authentication and BIOMETRIC_STRONG). Unlocking means the OS released
 * that secret after its own biometric prompt — not merely that a JS call
 * returned `success`. Enrolling a new face or fingerprint invalidates the
 * key, which forces the PIN and a fresh opt-in.
 */
const unavailableBiometrics: BiometricAvailability = {
  available: false,
  kind: null,
  label: null,
  unavailableReason: "unsupported",
};

function boundSecretOptions(prompt: string): SecureStore.SecureStoreOptions {
  return {
    requireAuthentication: true,
    authenticationPrompt: prompt,
    // Removed by iOS if the device passcode is turned off.
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  };
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  try {
    const [hasHardware, isEnrolled, supportedTypes, enrolledLevel] =
      await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
        LocalAuthentication.getEnrolledLevelAsync(),
      ]);

    return resolveBiometricAvailability({
      platform: Platform.OS,
      hasHardware,
      isEnrolled,
      hasFace: supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ),
      hasFingerprint: supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ),
      strongEnrolled:
        enrolledLevel >= LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG,
    });
  } catch {
    return unavailableBiometrics;
  }
}

export function biometricUnavailableCopy(
  reason: BiometricAvailability["unavailableReason"],
): string {
  return biometricUnavailableMessage(reason, Platform.OS);
}

function enableErrorCopy(
  error: LocalAuthentication.LocalAuthenticationError | string,
  label: string,
): string {
  switch (error) {
    case "missing_usage_description":
      return `${label} needs a TracePay development build (not Expo Go).`;
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
    case "user_fallback":
      return `${label} was not turned on. You can enable it later in Security settings.`;
    case "lockout":
      return `${label} is temporarily locked. Unlock your device with its passcode, then try again.`;
    case "passcode_not_set":
      return "Set a device passcode before enabling biometric unlock.";
    case "authentication_failed":
      return `${label} did not match. Please try again.`;
    default:
      return `Could not verify ${label}. Please try again.`;
  }
}

/**
 * Asks for explicit consent via the OS prompt, then stores the bound secret.
 * Android prompts on the write itself (Keystore encryption needs the user);
 * iOS writes silently, so it prompts with LocalAuthentication first.
 */
export async function enableBiometricsOnDevice(): Promise<BiometricEnableResult> {
  const availability = await getBiometricAvailability();
  if (!availability.available) {
    return {
      enabled: false,
      message: biometricUnavailableCopy(availability.unavailableReason),
    };
  }

  const label = availability.label ?? "Biometrics";

  if (!SecureStore.canUseBiometricAuthentication()) {
    return {
      enabled: false,
      message: biometricUnavailableCopy("weak_only"),
    };
  }

  if (Platform.OS === "ios") {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Enable ${label} for TracePay`,
      cancelLabel: "Cancel",
      disableDeviceFallback: true,
    }).catch(() => null);

    if (!result) {
      return { enabled: false, message: `Could not start ${label}.` };
    }
    if (!result.success) {
      return { enabled: false, message: enableErrorCopy(result.error, label) };
    }
  }

  try {
    const secret = Array.from(await getRandomBytesAsync(32), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    await SecureStore.deleteItemAsync(
      SECURITY_STORAGE_KEYS.biometricSecret,
      boundSecretOptions(""),
    ).catch(() => undefined);
    await SecureStore.setItemAsync(
      SECURITY_STORAGE_KEYS.biometricSecret,
      secret,
      boundSecretOptions(`Enable ${label} for TracePay`),
    );
  } catch {
    return {
      enabled: false,
      message: `${label} was not turned on. You can enable it later in Security settings.`,
    };
  }

  await saveBiometricsEnabled(true);
  return { enabled: true };
}

/**
 * Shows the OS biometric prompt by reading the bound secret. Never offers
 * the device passcode: the TracePay PIN is the fallback.
 */
export async function unlockWithBiometrics(
  label: string,
): Promise<BiometricUnlockResult> {
  const availability = await getBiometricAvailability();
  if (!availability.available) {
    return {
      status: "unavailable",
      message: `${label} is not available right now. Enter your PIN.`,
    };
  }

  let secret: string | null;
  try {
    secret = await SecureStore.getItemAsync(
      SECURITY_STORAGE_KEYS.biometricSecret,
      boundSecretOptions("Unlock TracePay"),
    );
  } catch {
    // Cancelled, mismatched, OS lockout, or the app's Face ID permission is
    // off. The OS already explained mismatches; offer the PIN.
    return {
      status: "failed",
      message: `${label} didn't unlock TracePay. Enter your PIN, or try ${label} again.`,
    };
  }

  if (!secret || secret.length < 32) {
    return {
      status: "invalidated",
      message: `Your device's biometrics changed, so ${label} was turned off. Enter your PIN, then turn it back on in Security settings.`,
    };
  }

  return { status: "success" };
}

export async function loadBiometricsEnabled(): Promise<boolean> {
  return (
    (await credentialStorage.get(SECURITY_STORAGE_KEYS.biometricsEnabled)) ===
    "true"
  );
}

export async function saveBiometricsEnabled(enabled: boolean): Promise<void> {
  await credentialStorage.set(
    SECURITY_STORAGE_KEYS.biometricsEnabled,
    enabled ? "true" : "false",
  );
}

export async function clearBiometrics(): Promise<void> {
  await Promise.all([
    credentialStorage.remove(SECURITY_STORAGE_KEYS.biometricsEnabled),
    SecureStore.deleteItemAsync(
      SECURITY_STORAGE_KEYS.biometricSecret,
      boundSecretOptions(""),
    ).catch(() => undefined),
  ]);
}
