import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Your money," highlight="your privacy" description="Your financial information is protected and you stay in control of what TracePay can access." actionLabel="Continue" next="/(auth)/create-account"  />;
}
