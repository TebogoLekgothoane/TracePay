import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useState } from "react";

export function useBiometricAuth() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("Biometrics");

  useEffect(() => {
    void (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsAvailable(compatible && enrolled);

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("Face ID");
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType("Fingerprint");
      } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        setBiometricType("Iris");
      }
    })();
  }, []);

  const authenticate = useCallback(async (promptMessage = "Unlock TracePay"): Promise<boolean> => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Use PIN",
      disableDeviceFallback: true,
    });
    return result.success;
  }, []);

  return { isAvailable, biometricType, authenticate };
}
