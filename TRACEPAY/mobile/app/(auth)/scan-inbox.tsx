import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Scan your" highlight="inbox" description="TracePay can scan your inbox for transaction evidence and recurring charges." actionLabel="Continue" next="/(tabs)"  />;
}
