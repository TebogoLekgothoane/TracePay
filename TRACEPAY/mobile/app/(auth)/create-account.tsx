import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Create your" highlight="account" description="Set up your TracePay account with a secure password." actionLabel="Continue" next="/(auth)/device-security"  />;
}
