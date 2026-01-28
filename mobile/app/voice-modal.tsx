import React, { useMemo } from "react";
import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { VoiceModal } from "@/components/voice-modal";
import type { Bank } from "@/components/bank-card";

const MOCK_BANKS: Bank[] = [
  { id: "capitec", name: "Capitec", type: "bank", totalLost: 1193.5 },
  { id: "standard-bank", name: "Standard Bank", type: "bank", totalLost: 530.2 },
  { id: "mtn-momo", name: "MTN MoMo", type: "momo", totalLost: 496.0 },
];

export default function VoiceModalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bankId } = useLocalSearchParams<{ bankId?: string }>();

  const bank = useMemo(() => MOCK_BANKS.find((b) => b.id === bankId) ?? MOCK_BANKS[0], [bankId]);

  const text =
    bank.type === "momo"
      ? "Kule nyanga imali yakho iphume kakhulu kwi-airtime ne-data usebenzisa i-MoMo. Ukuba usebenzise ii-bundle zenyanga, ubunokonga."
      : "Kule nyanga imali yakho iphume kakhulu kwiintlawulo ezifihlakeleyo. Makhe sijonge indlela yokuyinciphisa.";

  return (
    <ThemedView className="flex-1 bg-black/40">
      <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: insets.bottom + 12 }}>
        <View className="px-4 pb-4">
          <View className="items-end mb-3">
            <Pressable
              onPress={() => router.back()}
              className="bg-blue w-10 h-10 rounded-full items-center justify-center"
            >
              <Feather name="x" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          <VoiceModal text={text} />
        </View>
      </View>
    </ThemedView>
  );
}

