import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Connect your" highlight="messages" description="Allow TracePay to find recurring charges and money leaks in your notifications." actionLabel="Continue" next="/(auth)/notification-consent"  />;
}
