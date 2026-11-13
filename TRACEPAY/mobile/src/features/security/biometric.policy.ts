import type { BiometricAvailability } from "./security.types";

export type BiometricCapabilities = {
  platform: "ios" | "android" | string;
  hasHardware: boolean;
  isEnrolled: boolean;
  hasFace: boolean;
  hasFingerprint: boolean;
  /** Android: a Class 3 (BIOMETRIC_STRONG) biometric is enrolled. */
  strongEnrolled: boolean;
};

/**
 * Decides whether biometric unlock is acceptable for a financial app.
 *
 * Android: only Class 3 (strong) biometrics qualify, because only those can
 * gate a Keystore key. Many face-unlock implementations are Class 2 and are
 * rejected. The OS does not say which enrolled modality is the strong one,
 * so a device with both face and fingerprint gets a generic label.
 */
export function resolveBiometricAvailability(
  caps: BiometricCapabilities,
): BiometricAvailability {
  if (!caps.hasHardware) {
    return unavailable("no_hardware");
  }
  if (!caps.isEnrolled) {
    return unavailable("not_enrolled");
  }

  if (caps.platform === "ios") {
    if (caps.hasFace) {
      return { available: true, kind: "face", label: "Face ID", unavailableReason: null };
    }
    if (caps.hasFingerprint) {
      return {
        available: true,
        kind: "fingerprint",
        label: "Touch ID",
        unavailableReason: null,
      };
    }
    return unavailable("unsupported");
  }

  if (caps.platform === "android") {
    if (!caps.strongEnrolled) {
      return unavailable("weak_only");
    }
    if (caps.hasFingerprint && !caps.hasFace) {
      return {
        available: true,
        kind: "fingerprint",
        label: "Fingerprint",
        unavailableReason: null,
      };
    }
    if (caps.hasFace && !caps.hasFingerprint) {
      return {
        available: true,
        kind: "face",
        label: "Face unlock",
        unavailableReason: null,
      };
    }
    return {
      available: true,
      kind: "generic",
      label: "Biometrics",
      unavailableReason: null,
    };
  }

  return unavailable("unsupported");
}

function unavailable(
  reason: NonNullable<BiometricAvailability["unavailableReason"]>,
): BiometricAvailability {
  return { available: false, kind: null, label: null, unavailableReason: reason };
}

export function biometricUnavailableMessage(
  reason: BiometricAvailability["unavailableReason"],
  platform: string,
): string {
  switch (reason) {
    case "not_enrolled":
      return platform === "ios"
        ? "Set up Face ID or Touch ID in iOS Settings, then return here to enable it."
        : "Add a fingerprint in your device settings, then return here.";
    case "no_hardware":
      return "This device does not support biometric unlock.";
    case "weak_only":
      return "Your device's face or fingerprint unlock is not secure enough for TracePay. Add a fingerprint, or keep using your PIN.";
    default:
      return "Biometric unlock is not available on this device. You can continue using your PIN.";
  }
}
