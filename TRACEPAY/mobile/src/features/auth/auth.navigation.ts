export function continueAfterAuth({
  hasPin,
  lockApp,
  router,
  unlockApp,
}: {
  hasPin: boolean;
  lockApp: () => void;
  router: { replace: (href: "/(auth)/unlock" | "/(tabs)") => void };
  unlockApp: () => void;
}): void {
  if (hasPin) {
    lockApp();
    router.replace("/(auth)/unlock");
    return;
  }

  unlockApp();
  router.replace("/(tabs)");
}
