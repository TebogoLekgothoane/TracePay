import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Create a new" highlight="password" description="Choose a strong password to keep your account secure." actionLabel="Continue" next="/(auth)/password-updated"  />;
}
