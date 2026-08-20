import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Stop hidden" highlight="money leaks" description="TracePay scans your bank and mobile SMS for forgotten fees, advances, and subscriptions." actionLabel="Get Started" next="/(onboarding)/features" secondaryLabel="Log In" secondaryNext="/(auth)/password" />;
}
