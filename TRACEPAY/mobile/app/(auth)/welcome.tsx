import { ScreenShell } from "../../src/components/ScreenShell";

export default function Screen() {
  return <ScreenShell title="Welcome to" highlight="TracePay" description="Sign in to uncover hidden money leaks or create your TracePay account." actionLabel="Create Account" next="/(auth)/create-account" secondaryLabel="Log In" secondaryNext="/(auth)/password" />;
}
