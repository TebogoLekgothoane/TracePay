import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";

import { PinEntryScreen } from "../../src/components/auth/PinEntryScreen";
import { useAppLock } from "../../src/features/security/AppLockProvider";

export default function DeviceSecurityScreen() {
  const { preparePin } = useAppLock();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const handleComplete = async (pin: readonly number[]) => {
    setErrorMessage(null);

    try {
      await preparePin(pin);
      router.replace("/(auth)/confirm-pin");
    } catch {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      );
      setErrorMessage("Could not create your PIN. Please try again.");
      setResetKey((value) => value + 1);
    }
  };

  return (
    <PinEntryScreen
      errorMessage={errorMessage}
      onComplete={handleComplete}
      resetKey={resetKey}
      subtitle="Choose a 4-digit PIN for this device"
      title="Create your PIN"
    />
  );
}
