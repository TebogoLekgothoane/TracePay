import {
  View,
  Text,
  SafeAreaView,
  StatusBar,
  Switch,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { TracePayLogo } from "@/components/TracePayLogo";
import { useState } from "react";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/lib/cn";

const BANKS = [
  {
    key: "capitec",
    name: "Capitec Bank",
    selectedChip: "border-[#0085C7] bg-[#0085C712]",
    checkBg: "bg-[#0085C7]",
    selectedText: "text-[#0085C7] font-bold",
    iconColor: "#0085C7",
  },
  {
    key: "absa",
    name: "ABSA",
    selectedChip: "border-red-600 bg-red-600/10",
    checkBg: "bg-red-600",
    selectedText: "text-red-600 font-bold",
    iconColor: "#DC2626",
  },
  {
    key: "fnb",
    name: "FNB",
    selectedChip: "border-amber-600 bg-amber-600/10",
    checkBg: "bg-amber-600",
    selectedText: "text-amber-600 font-bold",
    iconColor: "#D97706",
  },
  {
    key: "standard",
    name: "Standard Bank",
    selectedChip: "border-[#1C4F8C] bg-[#1C4F8C12]",
    checkBg: "bg-[#1C4F8C]",
    selectedText: "text-[#1C4F8C] font-bold",
    iconColor: "#1C4F8C",
  },
  {
    key: "nedbank",
    name: "Nedbank",
    selectedChip: "border-green-600 bg-green-600/10",
    checkBg: "bg-green-600",
    selectedText: "text-green-600 font-bold",
    iconColor: "#16A34A",
  },
];

const EXTRA_ACCOUNTS = [
  { key: "mobile" as const, title: "Mobile Money", desc: "MTN MoMo, Vodacom M-Pesa, Telkom" },
  { key: "sassa" as const, title: "SASSA / Government", desc: "Social grants, pension payments" },
];

export default function ConnectAccountsScreen() {
  const { connectedAccounts, toggleAccount } = useOnboardingStore();
  const { setConnectedAccounts, setConsentGiven } = useProfileStore();
  const onboardingData = useOnboardingStore();
  const [selectedBanks, setSelectedBanks] = useState<Set<string>>(new Set(["capitec"]));

  const toggleBank = (key: string) => {
    setSelectedBanks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleContinue = () => {
    setConsentGiven(onboardingData.consentGiven);
    setConnectedAccounts({ ...connectedAccounts, bank: selectedBanks.size > 0 });
    router.push({
      pathname: "/sms-scanning",
      params: { fromOnboarding: "1" },
    });
  };

  return (
    <SafeAreaView className="screen">
      <StatusBar barStyle="dark-content" />

      <View className="onboarding-header">
        <TracePayLogo />
        <View className="step-dots">
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              className={cn(
                "step-dot",
                i === 3 && "step-dot-active",
                i < 3 && "step-dot-done",
              )}
            />
          ))}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="screen-scroll-onboarding"
        showsVerticalScrollIndicator={false}
      >
        <Text className="overline-brand mb-2.5">
          STEP 4 OF 4
        </Text>
        <Text className="heading-xl mb-2.5">
          Connect your accounts
        </Text>
        <Text className="text-[15px] font-sans text-gray-500 leading-[22px] mb-7">
          Select your bank and tell us how you want TracePay to scan for leaks.
        </Text>

        <Text className="label-sm mb-3 tracking-wide">
          Your bank
        </Text>
        <View className="flex-row flex-wrap gap-2.5 mb-7">
          {BANKS.map((bank) => {
            const isSelected = selectedBanks.has(bank.key);
            return (
              <Button
                key={bank.key}
                variant="outline"
                className={cn(
                  "flex-row items-center gap-1.5 py-3 px-4 rounded-[10px]",
                  isSelected && bank.selectedChip,
                )}
                onPress={() => toggleBank(bank.key)}
              >
                {isSelected && (
                  <View className={cn("w-[18px] h-[18px] rounded-full items-center justify-center", bank.checkBg)}>
                    <MaterialCommunityIcons name="check" size={10} color="#fff" />
                  </View>
                )}
                <Text className={cn("text-[13px] font-medium text-gray-700", isSelected && bank.selectedText)}>
                  {bank.name}
                </Text>
              </Button>
            );
          })}
        </View>

        <Text className="label-sm mb-3 tracking-wide">
          Other accounts
        </Text>
        <View className="bg-white rounded-[14px] overflow-hidden border border-gray-100 shadow-sm mb-7">
          {EXTRA_ACCOUNTS.map((acc) => (
            <View
              key={acc.key}
              className="flex-row items-center gap-3.5 px-4 py-3.5 border-b border-gray-100"
            >
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-gray-900 mb-0.5">{acc.title}</Text>
                <Text className="caption">{acc.desc}</Text>
              </View>
              <Switch
                value={connectedAccounts[acc.key]}
                onValueChange={() => toggleAccount(acc.key)}
                trackColor={{ false: "#E5E7EB", true: "#C4B5FD" }}
                thumbColor={connectedAccounts[acc.key] ? "#7C3AED" : "#9CA3AF"}
              />
            </View>
          ))}
        </View>

        <Text className="label-sm mb-3 tracking-wide">
          How should TracePay scan?
        </Text>

        <View className="flex-row items-center gap-3 bg-white rounded-xl p-3.5 mb-2.5 border-[1.5px] border-border shadow-sm">
          <View className="w-10 h-10 rounded-[10px] items-center justify-center shrink-0 bg-brand-purple-light">
            <MaterialCommunityIcons name="message-text-outline" size={20} color="#7C3AED" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-900 mb-0.5">SMS inbox scan</Text>
            <Text className="caption">
              Read bank & operator notifications · Most accurate · Always on
            </Text>
          </View>
          <View className="badge-success py-0.5 rounded-md">
            <Text className="text-[11px] font-bold text-green-600">ON</Text>
          </View>
        </View>
        <View className="flex-row items-start mt-2">
          <MaterialCommunityIcons name="information-outline" size={14} color="#6B7280" />
          <Text className="caption flex-1 leading-[18px]">
            {" "}
            You can update linked accounts anytime from your Profile.
          </Text>
        </View>
      </ScrollView>

      <View className="onboarding-footer-row">
        <Button
          variant="outline"
          size="icon"
          className="w-[52px] h-[52px] rounded-[14px]"
          onPress={() => router.back()}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#6B7280" />
        </Button>
        <Button
          flex
          size="lg"
          onPress={handleContinue}
          iconRight={<MaterialCommunityIcons name="radar" size={20} color="#fff" />}
        >
          Scan My Inbox
        </Button>
      </View>
    </SafeAreaView>
  );
}

