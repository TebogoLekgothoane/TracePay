import { ScreenShell } from "../src/components/ScreenShell";

export default function Index() {
  return <ScreenShell title="Welcome to" highlight="TracePay" description="Find hidden money leaks, protect your finances, and make smarter decisions." actionLabel="Get Started" next="/(auth)/welcome" />;
}
