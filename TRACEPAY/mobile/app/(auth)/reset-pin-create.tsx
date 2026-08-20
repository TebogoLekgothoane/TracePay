import { router } from "expo-router";

import { PinEntryScreen } from "../../src/components/auth/PinEntryScreen";

export default function ResetPinCreateScreen() {
  return (
    <PinEntryScreen
      onComplete={async () => {
        router.replace("/(auth)/reset-pin-confirm");
      }}
      subtitle="Choose a new 4-digit PIN"
      title="Create new PIN"
    />
  );
}
