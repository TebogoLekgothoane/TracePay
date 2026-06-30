import React from "react";
import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { router } from "expo-router";

const SCAN_SOURCES = [
  { id: "1", name: "Capitec", preview: "R8.00 fee charged for ATM withdrawal..." },
  { id: "2", name: "MTN", preview: "R49.99 deducted for iflix subscription..." },
  { id: "3", name: "Vodacom", preview: "Airtime advance: R30.00 + R5.40 fee..." },
  { id: "4", name: "ABSA", preview: "Debit order R199: Gym (unused 4 months)..." },
];

export default function SmsScanScreen() {
  const { colors } = useColorScheme();

  return (
    <Screen>
      <AppText variant="titleMd" className="mb-1">
        Money leak scanner
      </AppText>
      <AppText variant="lead" className="mb-5">
        Find out what is draining your airtime and money
      </AppText>

      <Card glass={false} className="mb-6 border-0 bg-brand-purple">
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-xl bg-white/20">
          <MaterialCommunityIcons name="message-text" size={28} color="#FFFFFF" />
        </View>
        <AppText variant="title" className="mb-0.5 text-white">
          Bank SMS analysis
        </AppText>
        <AppText variant="caption" className="mb-3.5 text-white/75">
          Powered by TracePay AI
        </AppText>
        <AppText variant="bodySm" className="mb-4 leading-[22px] text-white">
          TracePay scans your Capitec, ABSA, FNB, MTN and Vodacom notification SMSes to spot
          recurring fees, zombie subscriptions and hidden charges.
        </AppText>
        <View className="flex-row items-center self-start rounded-full bg-white/20 px-3.5 py-2">
          <MaterialCommunityIcons name="shield-check-outline" size={14} color="#FFFFFF" />
          <AppText variant="bodySm" className="ml-1 font-medium text-white">
            Read-only · Nothing is shared externally
          </AppText>
        </View>
      </Card>

      <AppText variant="overline" className="mb-3">
        What we will scan
      </AppText>

      {SCAN_SOURCES.map((source) => (
        <Card key={source.id} className="mb-2.5" contentClassName="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-purple-light dark:bg-primary/20">
            <MaterialCommunityIcons name="message-text-outline" size={20} color={colors.primary} />
          </View>
          <View className="flex-1">
            <AppText variant="title" className="mb-0.5">
              {source.name}
            </AppText>
            <AppText variant="bodySm">{source.preview}</AppText>
          </View>
        </Card>
      ))}

      <AppText variant="bodyMuted" className="my-3 text-center">
        + dozens more from your inbox...
      </AppText>

      <Button
        size="lg"
        fullWidth
        onPress={() => router.push("/(tabs)/sms-scanning")}
        className="mt-1 h-14 rounded-[24px] shadow-lg"
        icon={<MaterialCommunityIcons name="lightning-bolt" size={20} color="#FFFFFF" />}
      >
        Scan my SMS inbox →
      </Button>
    </Screen>
  );
}
