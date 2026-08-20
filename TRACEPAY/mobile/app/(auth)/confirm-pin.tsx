import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";

import { PinEntryScreen } from "../../src/components/auth/PinEntryScreen";
import { useAppLock } from "../../src/features/security/AppLockProvider";

export default function ConfirmPinScreen() {
  const { confirmPin } = useAppLock();
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const handleComplete = async (pin: readonly number[]) => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const matches = await confirmPin(pin);
      if (!matches) {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error,
        );
        setErrorMessage("PINs do not match");
        setResetKey((value) => value + 1);
        return;
      }

      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
      router.replace("/(auth)/biometric-setup");
    } catch {
      setErrorMessage("Could not save your PIN. Please try again.");
      setResetKey((value) => value + 1);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <PinEntryScreen
      errorMessage={errorMessage}
      isBusy={isBusy}
      onComplete={handleComplete}
      resetKey={resetKey}
      subtitle="Enter the same PIN again"
      title="Confirm your PIN"
    />
  );
}
