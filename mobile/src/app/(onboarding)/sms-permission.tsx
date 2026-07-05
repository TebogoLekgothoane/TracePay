import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { AppText } from "@/components/Typography";
import { useIngestion } from "@/context/SMSIngestionContext";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function SmsPermissionScreen() {
  const { requestPermission, refreshPermission, openPermissionSettings } = useIngestion();
  const { colors } = useColorScheme();
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const goToScan = () => {
    router.push({
      pathname: "/(tabs)/sms-scanning",
      params: { fromOnboarding: "1" },
    });
  };

  const continueIfGranted = useCallback(async () => {
    const status = await refreshPermission();
    if (status === "granted") {
      setBlocked(false);
      goToScan();
      return true;
    }
    setBlocked(true);
    return false;
  }, [refreshPermission]);

  const handleAllow = async () => {
    setLoading(true);
    const status = await requestPermission();
    setLoading(false);
    if (status === "granted") {
      goToScan();
      return;
    }
    setBlocked(true);
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && blocked) {
        void continueIfGranted();
      }
    });
    return () => sub.remove();
  }, [blocked, continueIfGranted]);

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-transparent" edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>
        <AppText variant="display" className="mt-4">
          Allow SMS{"\n"}
          <AppText variant="displayAccent">access</AppText>
        </AppText>
        <AppText variant="lead" className="mt-3">
          TracePay reads bank SMS on your device to import transactions. Nothing leaves your phone without your consent.
        </AppText>

        <Card className="mt-6">
          <View className="flex-row items-start gap-3">
            <Feather name="shield" size={22} color={colors.primary} />
            <AppText variant="bodySm" className="flex-1 leading-5">
              On Android, tap Allow when prompted. If you see a security warning, open Settings → Permissions → SMS and enable TracePay.
            </AppText>
          </View>
        </Card>

        {blocked ? (
          <View className="mt-4 gap-3 rounded-[20px] border border-red-500/30 bg-red-500/10 p-4">
            <AppText variant="title" className="text-red-300">SMS permission blocked</AppText>
            <AppText variant="bodySm" className="text-red-200">
              Open Settings, allow SMS access for TracePay, then return here.
            </AppText>
            <Button size="lg" fullWidth onPress={openPermissionSettings}>Open Settings</Button>
            <Button variant="outline" size="lg" fullWidth onPress={() => void continueIfGranted()}>
              I&apos;ve enabled it — check again
            </Button>
          </View>
        ) : null}
      </ScrollView>

      <View className="border-t border-border px-6 pb-6 pt-4 dark:border-white/10">
        <Button size="lg" fullWidth className="h-14 rounded-[24px]" onPress={handleAllow} loading={loading}>
          {blocked ? "Try again" : "Allow SMS access"}
        </Button>
      </View>
    </SafeAreaView>
  );
}
