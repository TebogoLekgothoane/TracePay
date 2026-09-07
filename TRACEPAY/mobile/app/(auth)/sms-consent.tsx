import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { requestSmsPermission } from "../../src/ingestion/sms/sms.permissions";

export default function SmsConsentScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleContinue = async () => {
    if (Platform.OS !== "android") {
      router.push("/(auth)/notification-consent");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const granted = await requestSmsPermission();
      if (!granted) {
        setMessage("Allow SMS access when Android asks so TracePay can scan bank messages for leaks.");
        return;
      }
      router.push("/(auth)/notification-consent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background px-[18px]">
      <View className="flex-1 items-center justify-center">
        <Ionicons name="chatbubble-ellipses-outline" size={48} className="text-primary" />
        <Text className="mt-6 text-center text-[26px] font-bold text-foreground">
          Connect your messages
        </Text>
        <Text className="mt-3 max-w-[320px] text-center text-[13px] leading-[20px] text-muted-foreground">
          TracePay reads bank SMS alerts on this Android device to find recurring charges, fees, and subscriptions.
        </Text>
        {message ? (
          <Text className="mt-4 max-w-[320px] text-center text-[13px] leading-[20px] text-destructive">
            {message}
          </Text>
        ) : null}
      </View>
      <View className="pb-3">
        <Button loading={loading} onPress={handleContinue}>
          Allow SMS scan
        </Button>
      </View>
    </SafeAreaView>
  );
}
