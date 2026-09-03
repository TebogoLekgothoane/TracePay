import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

import { secureStorage } from "../../lib/secure-storage";
import { SECURITY_STORAGE_KEYS } from "./security.constants";
import type { BiometricAvailability } from "./security.types";

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  if (!hasHardware || !isEnrolled) {
    return { available: false, kind: null, label: null };
  }

  const hasFace = supportedTypes.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  );
  const hasFingerprint = supportedTypes.includes(
    LocalAuthentication.AuthenticationType.FINGERPRINT,
  );

  if (hasFace && (Platform.OS === "ios" || !hasFingerprint)) {
    return { available: true, kind: "face", label: "Use Face ID" };
  }
  if (hasFingerprint) {
    return {
      available: true,
      kind: "fingerprint",
      label: "Use fingerprint",
    };
  }
  if (hasFace) {
    return { available: true, kind: "face", label: "Use face recognition" };
  }

  return { available: false, kind: null, label: null };
}

export async function authenticateLocally(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock TracePay",
    cancelLabel: "Use PIN",
    disableDeviceFallback: true,
  });
  return result.success;
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

