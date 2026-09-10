import { Redirect, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { resolveAuthenticatedHomeHref } from "../src/features/auth/auth.navigation";
import { hasAuthSession } from "../src/features/auth/auth.service";
import { loadOnboardingCompleted } from "../src/features/onboarding/onboarding.service";

export default function Index() {
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [onboardingCompleted, sessionPresent] = await Promise.all([
          loadOnboardingCompleted(),
          hasAuthSession(),
        ]);
        if (!active) {
          return;
        }

        if (sessionPresent) {
          const home = await resolveAuthenticatedHomeHref();
          if (active) {
            setTarget(home);
          }
          return;
        }

        setTarget(onboardingCompleted ? "/(auth)/welcome" : "/(onboarding)");
      } catch {
        if (active) {
          setTarget("/(auth)/welcome");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!target) {
    return <View className="flex-1 bg-background" />;
  }

  return <Redirect href={target} />;
}
