import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Bell,
  ChevronRight,
  Globe,
  HelpCircle,
  LogOut,
  Moon,
  Settings,
  Shield,
  User,
  Wallet,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { signOut } from "../../src/features/auth/auth.service";
import { FALLBACK_PROFILE_NAME } from "../../src/features/auth/auth.constants";
import {
  formatSaPhoneDisplay,
  initialsFromName,
} from "../../src/features/auth/auth.validation";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import { LINKED_ACCOUNTS_HREF } from "../../src/features/accounts/account.navigation";
import { formatAccountsCount } from "../../src/features/accounts/account.validation";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useProfile } from "../../src/hooks/useProfile";
import { COLORS, TRACEPAY, withAlpha } from "../../src/theme/colors";

type SettingsRow = {
  id: string;
  label: string;
  value?: string;
  Icon: LucideIcon;
  href?: string;
};

const ACCOUNT_ROWS: SettingsRow[] = [
  {
    id: "personal",
    label: "Personal details",
    Icon: User,
    href: "/settings/account",
  },
  {
    id: "accounts",
    label: "Linked accounts",
    Icon: Wallet,
    href: LINKED_ACCOUNTS_HREF,
  },
  {
    id: "security",
    label: "Security & privacy",
    Icon: Shield,
    href: "/settings/security",
  },
  {
    id: "notifications",
    label: "Notifications",
    Icon: Bell,
    href: "/settings/notifications",
  },
];

const APP_ROWS: SettingsRow[] = [
  {
    id: "appearance",
    label: "Appearance",
    value: "Light mode",
    Icon: Moon,
  },
  {
    id: "language",
    label: "Language",
    value: "English",
    Icon: Globe,
  },
  {
    id: "help",
    label: "Help & support",
    Icon: HelpCircle,
  },
];

function SettingsSection({
  title,
  rows,
  palette,
}: {
  title: string;
  rows: SettingsRow[];
  palette: {
    primary: string;
    placeholder: string;
    destructive: string;
  };
}) {
  return (
    <View className="mt-6">
      <Text className="mb-3 text-[17px] font-bold text-foreground">{title}</Text>
      <View className="gap-2">
        {rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => row.href && router.push(row.href as never)}
            className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
          >
            <View
              className="h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: withAlpha(palette.primary, 0.1) }}
            >
              <row.Icon color={palette.primary} size={18} strokeWidth={2.2} />
            </View>
            <Text
              className="min-w-0 flex-1 text-[15px] font-medium text-foreground"
              numberOfLines={1}
            >
              {row.label}
            </Text>
            <View className="shrink-0 flex-row items-center gap-1">
              {row.value ? (
                <Text className="text-[13px] text-muted-foreground">{row.value}</Text>
              ) : null}
              <ChevronRight color={palette.placeholder} size={18} strokeWidth={2} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { colorScheme } = useColorScheme();
  const { clearDeviceLock } = useAppLock();
  const { error, loading, profile, retry } = useProfile();
  const { accounts } = useAccounts();
  const [loggingOut, setLoggingOut] = useState(false);
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const appearanceLabel = scheme === "dark" ? "Dark mode" : "Light mode";
  const showProfilePlaceholder = loading && !profile;
  const displayName = profile?.fullName ?? FALLBACK_PROFILE_NAME;
  const displayPhone = formatSaPhoneDisplay(profile?.phone);
  const initials = initialsFromName(profile?.fullName ?? "");

  const handleLogout = () => {
    if (loggingOut) {
      return;
    }

    Alert.alert("Log out", "You will need to sign in again on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setLoggingOut(true);
            try {
              await clearDeviceLock();
              await signOut();
              router.replace("/(auth)/welcome");
            } catch {
              Alert.alert("Could not log out", "Please try again.");
            } finally {
              setLoggingOut(false);
            }
          })();
        },
      },
    ]);
  };

  const appRows = APP_ROWS.map((row) =>
    row.id === "appearance" ? { ...row, value: appearanceLabel } : row,
  );
  const accountRows = ACCOUNT_ROWS.map((row) =>
    row.id === "accounts"
      ? { ...row, value: formatAccountsCount(accounts.length) }
      : row,
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
                Profile
              </Text>
              <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
                Manage your account and preferences
              </Text>
            </View>

            <IconButton
              accessibilityLabel="Open settings"
              className="mt-1"
              variant="soft"
              onPress={() => router.push("/settings/security")}
            >
              <Settings color={palette.primary} size={20} strokeWidth={2} />
            </IconButton>
          </View>

          <View className="mt-5 flex-row items-center gap-3 rounded-3xl bg-muted p-4">
            <LinearGradient
              colors={[trace.splashPayStart, trace.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text className="text-[18px] font-bold text-primary-foreground">
                {initials}
              </Text>
            </LinearGradient>

            <View className="min-w-0 flex-1">
              <View className="h-[22px] justify-center">
                {showProfilePlaceholder ? (
                  <View
                    accessibilityLabel="Loading profile"
                    className="h-3.5 w-40 rounded-full bg-muted-foreground/20"
                  />
                ) : (
                  <Text
                    className="text-[18px] font-bold text-foreground"
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>
                )}
              </View>
              <View className="mt-0.5 h-[18px] justify-center">
                {showProfilePlaceholder ? (
                  <View className="h-3 w-32 rounded-full bg-muted-foreground/15" />
                ) : (
                  <Text className="text-[13px] text-muted-foreground" numberOfLines={1}>
                    {error ? "Could not load profile" : displayPhone || "Phone number unavailable"}
                  </Text>
                )}
              </View>
              {error ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={loading}
                  hitSlop={8}
                  onPress={retry}
                >
                  <Text className="mt-1 text-[13px] font-semibold text-primary">
                    Retry
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <SettingsSection title="Account" rows={accountRows} palette={palette} />
          <SettingsSection title="App settings" rows={appRows} palette={palette} />

          <Button
            className="mt-6"
            loading={loggingOut}
            onPress={handleLogout}
            size="md"
            variant="destructive"
          >
            <>
              <LogOut color={palette.destructive} size={18} strokeWidth={2.2} />
              <Text className="text-[15px] font-semibold text-destructive">Log out</Text>
            </>
          </Button>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
