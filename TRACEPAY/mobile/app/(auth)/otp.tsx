import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Verify your phone"  description="Enter the verification code sent to your phone." actionLabel="Continue" next="/(auth)/device-security"  />;
}
