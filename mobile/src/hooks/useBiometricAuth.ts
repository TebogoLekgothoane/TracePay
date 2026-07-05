import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useState } from "react";

function resolveBiometricLabel(
  types: LocalAuthentication.AuthenticationType[],
): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return "Face ID";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return "Fingerprint";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return "Iris";
  }
  return "Biometrics";
}

export function useBiometricAuth() {
  const [isReady, setIsReady] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState("Biometrics");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [compatible, enrolled, types] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);

        if (cancelled) return;

        setBiometricType(resolveBiometricLabel(types));
        setIsAvailable(compatible && enrolled);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(async (promptMessage = "Unlock TracePay"): Promise<boolean> => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Use PIN",
      disableDeviceFallback: false,
      fallbackLabel: "Use PIN",
    });
    return result.success;
  }, []);

  return { isReady, isAvailable, biometricType, authenticate };
}
