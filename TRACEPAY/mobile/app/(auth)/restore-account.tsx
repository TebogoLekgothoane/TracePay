import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Restore your" highlight="account" description="Enter your registered phone number to restore TracePay on this device." actionLabel="Continue" next="/(auth)/unlock"  />;
}
