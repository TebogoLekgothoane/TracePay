import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Enter your password"  description="Enter your TracePay account password to continue." actionLabel="Continue" next="/(auth)/otp"  />;
}
