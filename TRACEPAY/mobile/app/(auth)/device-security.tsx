import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { PinEntryScreen } from "../../src/components/auth/PinEntryScreen";
import { authFlowParams } from "../../src/features/auth/auth.navigation";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import { formatLockoutRemaining } from "../../src/features/security/pin-attempts";

export default function DeviceSecurityScreen() {
  const { hasPin, preparePin, verifyPin } = useAppLock();
  const params = useLocalSearchParams<{ flow?: string }>();
  // Replacing an existing PIN always requires the current one first.
  const [step, setStep] = useState<"current" | "new">(
    hasPin ? "current" : "new",
  );
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const fail = (message: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setErrorMessage(message);
    setResetKey((value) => value + 1);
  };

  const handleCurrentPin = async (pin: readonly number[]) => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const result = await verifyPin(pin);
      switch (result.status) {
        case "success":
          setStep("new");
          setResetKey(0);
          break;
        case "incorrect":
          fail("Incorrect PIN");
          break;
        case "locked":
          fail(
            `Too many incorrect PINs. Try again in ${formatLockoutRemaining(
              result.until - Date.now(),
            )}.`,
          );
          break;
        case "wiped":
          router.replace("/(auth)/welcome");
          break;
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleNewPin = async (pin: readonly number[]) => {
    setErrorMessage(null);

    try {
      await preparePin(pin);
      router.replace({
        pathname: "/(auth)/confirm-pin",
        params: authFlowParams(params.flow),
      });
    } catch {
      fail("Could not create your PIN. Please try again.");
    }
  };

  if (step === "current") {
    return (
      <PinEntryScreen
        errorMessage={errorMessage}
        isBusy={isBusy}
        key="current"
        onComplete={handleCurrentPin}
        resetKey={resetKey}
        subtitle="Confirm it's you before choosing a new PIN"
        title="Enter current PIN"
      />
    );
  }

  return (
    <PinEntryScreen
      errorMessage={errorMessage}
      key="new"
      onComplete={handleNewPin}
      resetKey={resetKey}
      subtitle="Choose a 4-digit PIN to unlock TracePay on this device"
      title="Create your PIN"
    />
  );
}
