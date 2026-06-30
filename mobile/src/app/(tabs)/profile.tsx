import React from "react";
import { View, Switch, Platform, Alert } from "react-native";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useProfileStore } from "@/stores/profileStore";
import { useVoice } from "@/hooks/useVoice";
import { useLeaksStore, getActiveLeakStats } from "@/stores/leaksStore";
import { useColorScheme } from "@/hooks/useColorScheme";
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
  const { colors } = useColorScheme();

  const { count: activeLeakCount, totalMonthly: totalLeaking } = getActiveLeakStats(leaks);

  const connectedList = [
    {
      id: "1",
      name: "Bank Account",
      sub: connectedAccounts.bank ? "Connected" : "Not connected",
      iconName: "bank-outline",
      iconBg: connectedAccounts.bank
        ? "bg-green-100 dark:bg-green-900/40"
        : "bg-muted dark:bg-white/10",
      iconColor: connectedAccounts.bank ? colors.success : colors.mutedForeground,
      connected: connectedAccounts.bank,
    },
    {
      id: "2",
      name: "Mobile Money",
      sub: connectedAccounts.mobile ? "MTN MoMo / Vodacom" : "Not connected",
      iconName: "cellphone",
      iconBg: connectedAccounts.mobile
        ? "bg-green-100 dark:bg-green-900/40"
        : "bg-muted dark:bg-white/10",
      iconColor: connectedAccounts.mobile ? colors.success : colors.mutedForeground,
      connected: connectedAccounts.mobile,
    },
    {
      id: "3",
      name: "SASSA Grant",
      sub: connectedAccounts.sassa ? "Connected" : "Not connected",
      iconName: "shield-outline",
      iconBg: connectedAccounts.sassa
        ? "bg-green-100 dark:bg-green-900/40"
        : "bg-muted dark:bg-white/10",
      iconColor: connectedAccounts.sassa ? colors.success : colors.mutedForeground,
      connected: connectedAccounts.sassa,
    },
  ];

  const handleVoiceToggle = (val: boolean) => {
    setVoiceEnabled(val);
    if (val) {
      setTimeout(
        () =>
          speak(
            `Voice narration enabled. You have ${activeLeakCount} active money leaks totalling R${totalLeaking.toFixed(2)} per month.`,
          ),
        300,
      );
    }
  };

  const handleExportData = () => {
    Alert.alert(
      "Export Data",
      `Your data summary:\n• ${leaks.length} leaks\n• R${totalLeaking.toFixed(2)}/mo total leaking\n\nIn a production app, this would download a CSV file.`,
      [{ text: "OK" }],
    );
  };

  const doSignOut = async () => {
    await signOut();
    router.replace("/(onboarding)/language");
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
    { id: "lang", icon: "web", label: "Language", value: language, onPress: () => {} },
    { id: "privacy", icon: "lock-outline", label: "Privacy & Consent", value: "Active", onPress: () => {} },
    {
      id: "rescan",
      icon: "message-processing-outline",
      label: "Rescan SMS Inbox",
      value: "Run",
      onPress: () => router.push("/(tabs)/sms-scanning"),
    },
    { id: "export", icon: "file-document-outline", label: "Export My Data", value: "CSV", onPress: handleExportData },
    { id: "help", icon: "help-circle-outline", label: "Help & Support", value: "", onPress: () => {} },
  ];

  return (
    <Screen>
      <AppText variant="titleLg" className="mb-5">
        Profile
      </AppText>

      <Card className="mb-3" contentClassName="flex-row items-center gap-3.5">
        <View className="h-[60px] w-[60px] items-center justify-center rounded-[14px] bg-brand-purple-light dark:bg-primary/20">
          <MaterialCommunityIcons name="account-outline" size={32} color={colors.primary} />
        </View>
        <View className="flex-1">
          <AppText variant="title" className="mb-1">
            {name}
          </AppText>
          <AppText variant="bodySm" className="mb-1.5">
            {email || "Email verified"}
          </AppText>
          <View className="flex-row items-center">
            <View className="mr-1.5 h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" />
            <AppText variant="caption" className="font-semibold text-green-600 dark:text-green-400">
              POPIA compliant
            </AppText>
          </View>
        </View>
        <Button
          variant="ghost"
          size="icon"
          onPress={() =>
            speak(
              `Hello ${name.split(" ")[0]}. You have ${activeLeakCount} active leaks.`,
            )
          }
          className="min-h-0 p-2"
        >
          <MaterialCommunityIcons name="volume-high" size={20} color={colors.primary} />
        </Button>
      </Card>

      <Card className="mb-3" contentClassName="flex-row items-center gap-3">
        <View className="h-[42px] w-[42px] items-center justify-center rounded-[10px] bg-brand-purple-light dark:bg-primary/20">
          <Ionicons name="volume-medium-outline" size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <AppText variant="title">Voice narration</AppText>
          <AppText variant="bodySm" className="mt-0.5">
            Hear insights in {language}
          </AppText>
        </View>
        <Switch
          value={voiceEnabled}
          onValueChange={handleVoiceToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.primaryForeground}
        />
      </Card>

      {totalLeaking > 0 ? (
        <Card
          glass={false}
          className="mb-4 border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
          contentClassName="flex-row items-center gap-2"
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.destructive} />
          <AppText variant="bodySm" className="flex-1">
            R{totalLeaking.toFixed(2)}/month leaking from{" "}
            {activeLeakCount} active leaks
          </AppText>
        </Card>
      ) : null}

      <AppText variant="label" className="mb-2.5 text-muted-foreground">
        Connected accounts
      </AppText>

      <Card className="mb-5" contentClassName="gap-0 px-0 py-0">
        {connectedList.map((acc, i) => (
          <View key={acc.id}>
            {i > 0 ? <View className="surface-divider mx-3.5" /> : null}
            <View className="flex-row items-center px-3.5 py-3.5">
              <View className={cn("mr-3 h-[42px] w-[42px] items-center justify-center rounded-[10px]", acc.iconBg)}>
                <MaterialCommunityIcons name={acc.iconName as any} size={20} color={acc.iconColor} />
              </View>
              <View className="flex-1">
                <AppText variant="title">{acc.name}</AppText>
                <AppText variant="bodySm" className="mt-0.5">
                  {acc.sub}
                </AppText>
              </View>
              {acc.connected ? (
                <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.success} />
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-[30px] w-[30px] min-h-0 rounded-full border-[1.5px] border-primary"
                >
                  <Feather name="plus" size={16} color={colors.primary} />
                </Button>
              )}
            </View>
          </View>
        ))}
      </Card>

      <Card className="mb-4" contentClassName="gap-0 px-0 py-0">
        {menuItems.map((item, i) => (
          <View key={item.id}>
            {i > 0 ? <View className="surface-divider mx-3.5" /> : null}
            <Button
              variant="ghost"
              className="min-h-0 flex-row items-center gap-3 px-3.5 py-3.5"
              onPress={item.onPress}
            >
              <MaterialCommunityIcons name={item.icon as any} size={20} color={colors.foreground} />
              <AppText variant="label" className="flex-1 font-medium">
                {item.label}
              </AppText>
              <View className="flex-row items-center gap-1.5">
                {item.value ? <AppText variant="bodySm">{item.value}</AppText> : null}
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            </Button>
          </View>
        ))}
      </Card>

      <Card
        glass={false}
        className="mb-4 border border-brand-purple/20 bg-brand-purple-light dark:border-primary/30 dark:bg-primary/10"
      >
        <View className="mb-2 flex-row items-center">
          <MaterialCommunityIcons name="shield-lock-outline" size={18} color={colors.primary} />
          <AppText variant="label" className="ml-1 text-brand-purple dark:text-primary">
            Your data is protected
          </AppText>
        </View>
        <AppText variant="bodySm" className="leading-[19px]">
          TracePay only accesses data you explicitly consent to share. Your information is encrypted
          and never shared with third parties. You can revoke access anytime.
        </AppText>
      </Card>

      <Button
        variant="outline"
        fullWidth
        onPress={handleSignOut}
        className="mb-2 py-4"
        icon={<Feather name="log-out" size={16} color={colors.destructive} />}
        textClassName="text-destructive"
      >
        Sign out
      </Button>
    </Screen>
  );
}
