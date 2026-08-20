import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Password" highlight="updated" description="Your password has been updated successfully." actionLabel="Continue" next="/(auth)/welcome"  />;
}
