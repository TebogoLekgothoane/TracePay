import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";

import { PinEntryScreen } from "../../src/components/auth/PinEntryScreen";
import { authFlowParams } from "../../src/features/auth/auth.navigation";
import { useAppLock } from "../../src/features/security/AppLockProvider";

export default function ConfirmPinScreen() {
  const { confirmPin } = useAppLock();
  const params = useLocalSearchParams<{ flow?: string }>();
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
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error,
        );
        setErrorMessage("PINs do not match");
        setResetKey((value) => value + 1);
        return;
      }

      navigatingRef.current = true;
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
      router.replace({
        pathname: "/(auth)/biometric-setup",
        params: authFlowParams(params.flow),
      });
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
