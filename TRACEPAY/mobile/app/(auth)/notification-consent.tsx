import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import {
  isNotificationListenerEnabled,
  openNotificationListenerSettings,
} from "../../src/ingestion/notifications/notification.listener";

export default function NotificationConsentScreen() {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const value = Platform.OS === "android" ? await isNotificationListenerEnabled() : false;
      if (active) {
        setEnabled(value);
        setChecking(false);
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, []);

  const handleContinue = async () => {
    if (Platform.OS !== "android" || enabled) {
      router.push("/(auth)/scan-inbox");
      return;
    }
    await openNotificationListenerSettings();
  };

  return (
    <SafeAreaView className="flex-1 bg-background px-[18px]">
      <View className="flex-1 items-center justify-center">
        <Ionicons name="notifications-outline" size={48} className="text-primary" />
        <Text className="mt-6 text-center text-[26px] font-bold text-foreground">
          Read payment alerts
        </Text>
        <Text className="mt-3 max-w-[320px] text-center text-[13px] leading-[20px] text-muted-foreground">
          Enable notification access so TracePay can read banking and payment app alerts for money leaks.
        </Text>
        {!enabled && Platform.OS === "android" ? (
          <Text className="mt-4 max-w-[320px] text-center text-[13px] leading-[20px] text-muted-foreground">
            After enabling TracePay in Android settings, return here and continue.
          </Text>
        ) : null}
      </View>
      <View className="gap-3 pb-3">
        <Button loading={checking} onPress={handleContinue}>
          {enabled ? "Continue" : "Open notification access"}
        </Button>
        {!checking ? (
          <Button variant="secondary" onPress={() => router.push("/(auth)/scan-inbox")}>
            Continue without notifications
          </Button>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
