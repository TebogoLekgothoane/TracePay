import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { loadOnboardingCompleted } from "../src/features/onboarding/onboarding.service";

export default function Index() {
  const [isReady, setIsReady] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    let active = true;

    void loadOnboardingCompleted()
      .then((completed) => {
        if (!active) {
          return;
        }

        setHasCompletedOnboarding(completed);
      })
      .finally(() => {
        if (active) {
          setIsReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!isReady) {
    return <View className="flex-1 bg-background" />;
  }

  if (hasCompletedOnboarding) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href="/(onboarding)" />;
}
