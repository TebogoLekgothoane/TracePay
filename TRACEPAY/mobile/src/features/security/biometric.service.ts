import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

import { secureStorage } from "../../lib/secure-storage";
import { SECURITY_STORAGE_KEYS } from "./security.constants";
import type {
  BiometricAvailability,
  BiometricEnableResult,
} from "./security.types";

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  if (!hasHardware) {
    return {
      available: false,
      kind: null,
      label: null,
      unavailableReason: "no_hardware",
    };
  }

  if (!isEnrolled) {
    return {
      available: false,
      kind: null,
      label: null,
      unavailableReason: "not_enrolled",
    };
  }

  const hasFace = supportedTypes.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  );
  const hasFingerprint = supportedTypes.includes(
    LocalAuthentication.AuthenticationType.FINGERPRINT,
  );

  if (hasFace && (Platform.OS === "ios" || !hasFingerprint)) {
    return {
      available: true,
      kind: "face",
      label: Platform.OS === "ios" ? "Face ID" : "Face unlock",
      unavailableReason: null,
    };
  }
  if (hasFingerprint) {
    return {
      available: true,
      kind: "fingerprint",
      label: Platform.OS === "ios" ? "Touch ID" : "Fingerprint",
      unavailableReason: null,
    };
  }
  if (hasFace) {
    return {
      available: true,
      kind: "face",
      label: Platform.OS === "ios" ? "Face ID" : "Face unlock",
      unavailableReason: null,
    };
  }

  return {
    available: false,
    kind: null,
    label: null,
    unavailableReason: "unsupported",
  };
}

type AuthAttempt =
  | { success: true }
  | { success: false; message: string; code?: string };

function mapAuthError(
  error: LocalAuthentication.LocalAuthenticationError | string,
  warning?: string,
  biometricLabel = "Face ID",
): string {
  switch (error) {
    case "missing_usage_description":
      return (
        warning ??
        `${biometricLabel} needs a TracePay development build (not Expo Go). Build with EAS, then enable ${biometricLabel} again.`
      );
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
      return `${biometricLabel} was cancelled. Enter your TracePay PIN instead.`;
    case "user_fallback":
      return `Enter your TracePay PIN to continue.`;
    case "not_enrolled":
      return Platform.OS === "ios"
        ? "Face ID is not set up. Add it in iOS Settings → Face ID & Passcode, or use your TracePay PIN."
        : "No biometrics are enrolled on this device. Use your TracePay PIN.";
    case "not_available":
      return Platform.OS === "ios"
        ? `${biometricLabel} is blocked for this app. Open iOS Settings → TracePay → enable Face ID, or use your TracePay PIN.`
        : "Biometrics are not available right now. Use your TracePay PIN.";
    case "lockout":
      return `${biometricLabel} is locked after too many attempts. Unlock your iPhone, then use your TracePay PIN here.`;
    case "passcode_not_set":
      return "Set an iPhone passcode in Settings before enabling Face ID.";
    case "authentication_failed":
      return `${biometricLabel} did not match. Enter your TracePay PIN, or try Face ID again.`;
    case "timeout":
      return `${biometricLabel} timed out. Enter your TracePay PIN, or try again.`;
    default:
      return (
        warning ??
        `Could not verify ${biometricLabel}. Enter your TracePay PIN instead.`
      );
  }
}

/**
 * Biometrics only (Face ID / fingerprint). Never offers the device passcode —
 * TracePay PIN on the unlock screen is the fallback.
 */
export async function authenticateLocally(options?: {
  promptMessage?: string;
  cancelLabel?: string;
  biometricLabel?: string;
}): Promise<AuthAttempt> {
  const biometricLabel = options?.biometricLabel ?? "Face ID";

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: options?.promptMessage ?? "Unlock TracePay",
      cancelLabel: options?.cancelLabel ?? "Use PIN",
      // true = biometrics only (no iOS device passcode fallback)
      disableDeviceFallback: true,
    });

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      code: result.error,
      message: mapAuthError(result.error, result.warning, biometricLabel),
    };
  } catch {
    return {
      success: false,
      message:
        Platform.OS === "ios"
          ? "Face ID could not start. Enable Face ID for Expo Go (or TracePay) in iOS Settings, or use your TracePay PIN."
          : "Biometric authentication could not start. Use your TracePay PIN.",
    };
  }
}

export async function enableBiometricsOnDevice(): Promise<BiometricEnableResult> {
  const availability = await getBiometricAvailability().catch(
    (): BiometricAvailability => ({
      available: false,
      kind: null,
      label: null,
      unavailableReason: "unsupported",
    }),
  );

  if (!availability.available) {
    return {
      enabled: false,
      message: biometricUnavailableCopy(availability.unavailableReason),
    };
  }

  const label = availability.label ?? "biometrics";
  const attempt = await authenticateLocally({
    promptMessage: `Enable ${label} for TracePay`,
    cancelLabel: "Cancel",
    biometricLabel: label,
  });

  if (!attempt.success) {
    return { enabled: false, message: attempt.message };
  }

  await saveBiometricsEnabled(true);
  return { enabled: true };
}

export async function loadBiometricsEnabled(): Promise<boolean> {
  return (
    (await secureStorage.get(SECURITY_STORAGE_KEYS.biometricsEnabled)) ===
    "true"
  );
}

export async function saveBiometricsEnabled(enabled: boolean): Promise<void> {
  await secureStorage.set(
    SECURITY_STORAGE_KEYS.biometricsEnabled,
    enabled ? "true" : "false",
  );
}

export async function clearBiometricsEnabled(): Promise<void> {
  await secureStorage.remove(SECURITY_STORAGE_KEYS.biometricsEnabled);
}

export function biometricUnavailableCopy(
  reason: BiometricAvailability["unavailableReason"],
): string {
  if (reason === "not_enrolled") {
    return Platform.OS === "ios"
      ? "Set up Face ID or Touch ID in iOS Settings, then return here to enable it."
      : "Add a fingerprint or face unlock in your device settings, then return here.";
  }
  if (reason === "no_hardware") {
    return "This device does not support biometric unlock.";
  }
  return "Biometric unlock is not available on this device. You can continue using your PIN.";
}
