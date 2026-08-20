import { router } from "expo-router";

import { PinEntryScreen } from "../../src/components/auth/PinEntryScreen";

export default function ResetPinConfirmScreen() {
  return (
    <PinEntryScreen
      onComplete={async () => {
        router.replace("/(auth)/reset-pin-success");
      }}
      subtitle="Enter your new PIN again"
      title="Confirm new PIN"
    />
  );
}
