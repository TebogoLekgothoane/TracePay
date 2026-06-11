import React from "react";
import {
  View,
  Text,
  Switch,
  Platform,
  Alert,
} from "react-native";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { useProfileStore } from "@/stores/profileStore";
import { useVoice } from "@/hooks/useVoice";
import { useLeaksStore } from "@/stores/leaksStore";
import { router } from "expo-router";
import { cn } from "@/lib/cn";

export default function ProfileScreen() {
  const {
    name,
    email,
    language,
    voiceEnabled,
    setVoiceEnabled,
    connectedAccounts,
    signOut,
  } = useProfileStore();
  const { leaks } = useLeaksStore();
  const { speak } = useVoice();

  const totalLeaking = leaks
    .filter((l) => l.status === "active")
    .reduce((sum, l) => sum + l.amountMonthly, 0);

  const connectedList = [
    {
      id: "1",
      name: "Bank Account",
      sub: connectedAccounts.bank ? "Connected" : "Not connected",
      iconName: "bank-outline",
      iconBg: connectedAccounts.bank ? "bg-green-100" : "bg-gray-100",
      iconColor: connectedAccounts.bank ? "#16A34A" : "#6B7280",
      connected: connectedAccounts.bank,
    },
    {
      id: "2",
      name: "Mobile Money",
      sub: connectedAccounts.mobile ? "MTN MoMo / Vodacom" : "Not connected",
      iconName: "cellphone",
      iconBg: connectedAccounts.mobile ? "bg-green-100" : "bg-gray-100",
      iconColor: connectedAccounts.mobile ? "#16A34A" : "#6B7280",
      connected: connectedAccounts.mobile,
    },
    {
      id: "3",
      name: "SASSA Grant",
      sub: connectedAccounts.sassa ? "Connected" : "Not connected",
      iconName: "shield-outline",
      iconBg: connectedAccounts.sassa ? "bg-green-100" : "bg-gray-100",
      iconColor: connectedAccounts.sassa ? "#16A34A" : "#6B7280",
      connected: connectedAccounts.sassa,
    },
  ];

  const handleVoiceToggle = (val: boolean) => {
    setVoiceEnabled(val);
    if (val) {
      setTimeout(
        () =>
          speak(
            `Voice narration enabled. You have ${leaks.filter((l) => l.status === "active").length} active money leaks totalling R${totalLeaking.toFixed(2)} per month.`
          ),
        300
      );
    }
  };

  const handleExportData = () => {
    Alert.alert(
      "Export Data",
      `Your data summary:\n• ${leaks.length} leaks\n• R${totalLeaking.toFixed(2)}/mo total leaking\n\nIn a production app, this would download a CSV file.`,
      [{ text: "OK" }]
    );
  };

  const doSignOut = async () => {
    await signOut();
    router.replace("/welcome");
  };

  const handleSignOut = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Clear all data and return to onboarding?")) {
        doSignOut();
      }
    } else {
      Alert.alert("Sign Out", "Clear all data and return to onboarding?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: doSignOut },
      ]);
    }
  };

  const menuItems = [
    { id: "lang", icon: "web", label: "Language", value: language, hasChevron: true, onPress: () => {} },
    { id: "privacy", icon: "lock-outline", label: "Privacy & Consent", value: "Active", hasChevron: true, onPress: () => {} },
    { id: "rescan", icon: "message-processing-outline", label: "Rescan SMS Inbox", value: "Run", hasChevron: true, onPress: () => router.push("/sms-scanning") },
    { id: "export", icon: "file-document-outline", label: "Export My Data", value: "CSV", hasChevron: true, onPress: handleExportData },
    { id: "help", icon: "help-circle-outline", label: "Help & Support", value: "", hasChevron: true, onPress: () => {} },
  ];

  return (
    <Screen>
      <Text className="heading-xl mb-5">Profile</Text>

      <View className="card flex-row items-center mb-3">
          <View className="w-[60px] h-[60px] rounded-[14px] bg-brand-purple-light items-center justify-center mr-3.5">
            <MaterialCommunityIcons name="account-outline" size={32} color="#7C3AED" />
          </View>
          <View className="flex-1">
            <Text className="heading-md mb-1">{name}</Text>
            <Text className="body-text mb-1.5">{email || "Email verified"}</Text>
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-green-600 mr-1.5" />
              <Text className="text-xs font-semibold text-green-600">POPIA Compliant</Text>
            </View>
          </View>
          <Button
            variant="ghost"
            size="icon"
            onPress={() =>
              speak(
                `Hello ${name.split(" ")[0]}. You have ${leaks.filter((l) => l.status === "active").length} active leaks.`
              )
            }
            className="p-2"
          >
            <MaterialCommunityIcons name="volume-high" size={20} color="#7C3AED" />
          </Button>
      </View>

      <View className="flex-row items-center bg-white rounded-[14px] p-4 mb-3 shadow-sm">
        <View className="w-[42px] h-[42px] rounded-[10px] bg-brand-purple-light items-center justify-center mr-3">
          <Ionicons name="volume-medium-outline" size={20} color="#7C3AED" />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-gray-900 mb-0.5">Voice Narration</Text>
          <Text className="body-text">Hear insights in {language}</Text>
        </View>
        <Switch
          value={voiceEnabled}
          onValueChange={handleVoiceToggle}
          trackColor={{ false: "#E5E7EB", true: "#7C3AED" }}
          thumbColor="#FFFFFF"
        />
      </View>

      {totalLeaking > 0 && (
        <View className="flex-row items-center bg-red-50 rounded-xl p-3.5 mb-4 border border-red-200">
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#DC2626" />
          <Text className="text-sm font-sans text-gray-700 flex-1">
            {" "}<Text className="font-bold text-red-600">R{totalLeaking.toFixed(2)}/month</Text> leaking from {leaks.filter((l) => l.status === "active").length} active leaks
          </Text>
        </View>
      )}

      <Text className="label-sm mb-2.5">Connected Accounts</Text>

      <View className="bg-white rounded-[14px] px-3.5 mb-5 shadow-sm">
        {connectedList.map((acc, i) => (
          <View key={acc.id}>
            {i > 0 && <View className="h-px bg-gray-100" />}
            <View className="flex-row items-center py-3.5">
              <View className={cn("w-[42px] h-[42px] rounded-[10px] items-center justify-center mr-3", acc.iconBg)}>
                <MaterialCommunityIcons name={acc.iconName as any} size={20} color={acc.iconColor} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-gray-900 mb-0.5">{acc.name}</Text>
                <Text className="body-text">{acc.sub}</Text>
              </View>
              {acc.connected ? (
                <MaterialCommunityIcons name="check-circle-outline" size={22} color="#16A34A" />
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  className="w-[30px] h-[30px] rounded-full border-[1.5px] border-brand-purple min-h-0"
                >
                  <Feather name="plus" size={16} color="#7C3AED" />
                </Button>
              )}
            </View>
          </View>
        ))}
      </View>

      <View className="bg-white rounded-[14px] px-3.5 mb-4 shadow-sm">
        {menuItems.map((item, i) => (
          <View key={item.id}>
            {i > 0 && <View className="h-px bg-gray-100" />}
            <Button variant="ghost" className="flex-row items-center py-3.5 gap-3" onPress={item.onPress}>
              <MaterialCommunityIcons name={item.icon as any} size={20} color="#374151" />
              <Text className="flex-1 text-[15px] font-medium text-gray-900">{item.label}</Text>
              <View className="flex-row items-center gap-1.5">
                {item.value ? <Text className="body-text">{item.value}</Text> : null}
                {item.hasChevron && <Feather name="chevron-right" size={16} color="#9CA3AF" />}
              </View>
            </Button>
          </View>
        ))}
      </View>

      <View className="bg-brand-purple-light rounded-[14px] p-4 mb-4">
        <View className="flex-row items-center mb-2">
          <MaterialCommunityIcons name="shield-lock-outline" size={18} color="#7C3AED" />
          <Text className="text-sm font-semibold text-brand-purple"> Your Data is Protected</Text>
        </View>
        <Text className="body-text text-gray-700 leading-[19px]">
          TracePay only accesses data you explicitly consent to share. Your information is encrypted and never shared with third parties. You can revoke access anytime.
        </Text>
      </View>

      <Button variant="outline" fullWidth onPress={handleSignOut} className="py-4 mb-2 shadow-sm">
        <Feather name="log-out" size={16} color="#DC2626" />
        <Text className="text-[15px] font-semibold text-red-600"> Sign Out</Text>
      </Button>
    </Screen>
  );
}
