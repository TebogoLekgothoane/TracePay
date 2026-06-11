import React from "react";
import {
  View,
  Text,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { router } from "expo-router";

const SCAN_SOURCES = [
  { id: "1", name: "Capitec", preview: "R8.00 fee charged for ATM withdrawal..." },
  { id: "2", name: "MTN", preview: "R49.99 deducted for iflix subscription..." },
  { id: "3", name: "Vodacom", preview: "Airtime advance: R30.00 + R5.40 fee..." },
  { id: "4", name: "ABSA", preview: "Debit order R199: Gym (unused 4 months)..." },
];

export default function SmsScanScreen() {
  return (
    <Screen>
      <Text className="heading-lg mb-1">Money Leak Scanner</Text>
      <Text className="body-text mb-[18px]">
        Find out what is draining your airtime and money
      </Text>

      <View className="bg-brand-purple rounded-2xl p-5 mb-[22px] shadow-lg">
        <View className="w-12 h-12 rounded-xl bg-white/20 items-center justify-center mb-3">
          <MaterialCommunityIcons name="message-text" size={28} color="#FFFFFF" />
        </View>
        <Text className="text-xl font-bold text-white mb-0.5">Bank SMS Analysis</Text>
        <Text className="text-[13px] font-sans text-white/75 mb-3.5">Powered by TracePay AI</Text>
        <Text className="text-[15px] font-sans text-white leading-[22px] mb-4">
          TracePay scans your Capitec, ABSA, FNB, MTN and Vodacom notification SMSes to spot recurring fees, zombie subscriptions and hidden charges.
        </Text>
        <View className="flex-row items-center bg-white/20 px-3.5 py-2 rounded-full self-start">
          <MaterialCommunityIcons name="shield-check-outline" size={14} color="#FFFFFF" />
          <Text className="text-[13px] font-medium text-white"> Read-only · Nothing is shared externally</Text>
        </View>
      </View>

      <Text className="overline mb-3">
        WHAT WE WILL SCAN
      </Text>

      {SCAN_SOURCES.map((source) => (
        <View key={source.id} className="card-row">
          <View className="w-10 h-10 rounded-[10px] bg-brand-purple-light items-center justify-center mr-3">
            <MaterialCommunityIcons name="message-text-outline" size={20} color="#7C3AED" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-gray-900 mb-0.5">{source.name}</Text>
            <Text className="body-text">{source.preview}</Text>
          </View>
        </View>
      ))}

      <Text className="body-text text-center my-3">
        + dozens more from your inbox...
      </Text>

      <Button
        size="lg"
        fullWidth
        onPress={() => router.push("/sms-scanning")}
        className="mt-1 shadow-lg"
        icon={<MaterialCommunityIcons name="lightning-bolt" size={20} color="#FFFFFF" />}
      >
        Scan My SMS Inbox →
      </Button>
    </Screen>
  );
}
