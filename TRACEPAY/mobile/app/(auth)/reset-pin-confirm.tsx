import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRef, useState } from "react";

import { PinEntryScreen } from "../../src/components/auth/PinEntryScreen";
import { useAppLock } from "../../src/features/security/AppLockProvider";

export default function ResetPinConfirmScreen() {
  const { confirmPin } = useAppLock();
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const navigatingRef = useRef(false);

  const handleComplete = async (pin: readonly number[]) => {
    if (navigatingRef.current) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const matches = await confirmPin(pin);
      if (!matches) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorMessage("PINs do not match");
        setResetKey((value) => value + 1);
        return;
      }

      navigatingRef.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(auth)/reset-pin-success");
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
      subtitle="Enter your new PIN again"
      title="Confirm new PIN"
    />
  );
}
