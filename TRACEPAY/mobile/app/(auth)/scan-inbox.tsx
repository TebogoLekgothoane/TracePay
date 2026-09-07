import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { syncDeviceReadings } from "../../src/ingestion/ingestion.sync";

export default function ScanInboxScreen() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready to scan your bank SMS and payment notifications.");

  const handleScan = async () => {
    setLoading(true);
    setStatus("Scanning device readings...");
    try {
      const result = await syncDeviceReadings();
      setStatus("Collected " + result.collected + " readings and synced " + result.uploaded + ".");
      router.replace("/analysis/scanning");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not scan device readings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background px-[18px]">
      <View className="flex-1 items-center justify-center">
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Ionicons name="scan-outline" size={48} className="text-primary" />
        )}
        <Text className="mt-6 text-center text-[26px] font-bold text-foreground">
          Scan for leaks
        </Text>
        <Text className="mt-3 max-w-[320px] text-center text-[13px] leading-[20px] text-muted-foreground">
          {status}
        </Text>
      </View>
      <View className="gap-3 pb-3">
        <Button loading={loading} onPress={handleScan}>
          Start scan
        </Button>
        <Button variant="secondary" onPress={() => router.replace("/(tabs)") }>
          Skip for now
        </Button>
      </View>
    </SafeAreaView>
  );
}
