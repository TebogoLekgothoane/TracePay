import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SuccessCelebration } from "../../src/components/feedback/SuccessCelebration";
import { Button } from "../../src/components/ui/Button";
import { markLeaksUnlocked } from "../../src/features/leaks/leak-entitlement.store";

/** Simulated unlock celebration — confetti, then all findings are available. */
export default function LeaksUnlockedScreen() {
  const unlocked = useRef(false);

  useEffect(() => {
    if (unlocked.current) return;
    unlocked.current = true;
    void markLeaksUnlocked();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="flex-1 px-7">
        <SuccessCelebration
          title="All set"
          subtitle="Your full analysis is unlocked. Every finding is ready to review."
        />
        <View className="pb-5">
          <Button arrow onPress={() => router.replace("/(tabs)/leaks")}>
            View all leaks
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
