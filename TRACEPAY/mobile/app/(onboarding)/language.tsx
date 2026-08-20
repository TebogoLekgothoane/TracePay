import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Choose your" highlight="language" description="Select the language you would like to use TracePay in." actionLabel="Continue" next="/(onboarding)/introduction"  />;
}
