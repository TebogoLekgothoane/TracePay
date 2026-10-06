import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  ChevronRight,
  FlaskConical,
  Globe,
  HelpCircle,
  LogOut,
  Shield,
  ShieldCheck,
  User,
  Wallet,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { signOut } from "../../src/features/auth/auth.service";
import { FALLBACK_PROFILE_NAME } from "../../src/features/auth/auth.constants";
import {
  formatSaPhoneDisplay,
  initialsFromName,
} from "../../src/features/auth/auth.validation";
import { useAppLock } from "../../src/features/security/AppLockProvider";
import { LINKED_ACCOUNTS_HREF } from "../../src/features/accounts/account.navigation";
import { formatAccountsCount } from "../../src/features/accounts/account.validation";
import { DEFAULT_ONBOARDING_LANGUAGE } from "../../src/features/onboarding/onboarding.constants";
import { loadOnboardingLanguage } from "../../src/features/onboarding/onboarding.service";
import type { OnboardingLanguage } from "../../src/features/onboarding/onboarding.types";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useProfile } from "../../src/hooks/useProfile";
import { COLORS, TRACEPAY } from "../../src/theme/colors";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const PERSONAL_DETAILS_HREF = "/settings/account";
const SECURITY_HREF = "/settings/security";
const PRIVACY_HREF = "/settings/privacy";
const LANGUAGE_HREF = "/settings/language";
const HELP_HREF = "/settings/help";
const LEAK_INTELLIGENCE_DEBUG_HREF = "/debug/leak-intelligence";
const FINANCIAL_REASONING_DEBUG_HREF = "/debug/financial-reasoning";

type SettingsRow = {
  id: string;
  label: string;
  value?: string;
  Icon: LucideIcon;
  href?: string;
  onPress?: () => void;
  interactive?: boolean;
};

const ACCOUNT_ROWS: SettingsRow[] = [
  {
    id: "personal",
    label: "Personal details",
    Icon: User,
    href: PERSONAL_DETAILS_HREF,
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
    href: SECURITY_HREF,
  },
];

const PREFERENCE_ROWS: SettingsRow[] = [
  {
    id: "privacy",
    label: "Privacy & consent",
    value: "Active",
    Icon: ShieldCheck,
    href: PRIVACY_HREF,
  },
  {
    id: "language",
    label: "Language",
    value: "English",
    Icon: Globe,
    href: LANGUAGE_HREF,
  },
  {
    id: "help",
    label: "Help & support",
    Icon: HelpCircle,
    href: HELP_HREF,
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
  };
}) {
  return (
    <View className="mt-6">
      <Text className="mb-3 text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
        {title}
      </Text>
      <View className="gap-2">
        {rows.map((row) => {
          const interactive =
            row.interactive !== false && Boolean(row.href || row.onPress);

          return (
            <Pressable
              key={row.id}
              accessibilityRole={interactive ? "button" : "text"}
              disabled={!interactive}
              onPress={() => {
                if (row.onPress) {
                  row.onPress();
                  return;
                }
                if (row.href) {
                  router.push(row.href as never);
                }
              }}
              className={`flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 ${
                interactive ? "active:opacity-75" : ""
              }`}
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
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
                  <Text className="text-[13px] text-muted-foreground">
                    {row.value}
                  </Text>
                ) : null}
                {interactive ? (
                  <ChevronRight
                    color={palette.placeholder}
                    size={18}
                    strokeWidth={2}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { colorScheme } = useColorScheme();
  const { clearDeviceLock, hasPin } = useAppLock();
  const { error, loading, profile, retry } = useProfile();
  const { accounts } = useAccounts();
  const [loggingOut, setLoggingOut] = useState(false);
  const [languageLabel, setLanguageLabel] = useState<OnboardingLanguage>(
    DEFAULT_ONBOARDING_LANGUAGE,
  );
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const showProfilePlaceholder = loading && !profile;
  const displayName = profile?.fullName ?? FALLBACK_PROFILE_NAME;
  const displayPhone = formatSaPhoneDisplay(profile?.phone);
  const initials = initialsFromName(profile?.fullName ?? "");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadOnboardingLanguage().then((language) => {
        if (active) {
          setLanguageLabel(language);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );
  const handleLogout = () => {
    if (loggingOut) {
      return;
    }

    Alert.alert(
      "Log out?",
      "You will need your mobile number and password to sign in again on this device.",
      [
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
      ],
    );
  };

  const accountRows = ACCOUNT_ROWS.map((row) => {
    if (row.id === "accounts") {
      return { ...row, value: formatAccountsCount(accounts.length) };
    }
    if (row.id === "security") {
      return { ...row, value: hasPin ? "Protected" : "Set up" };
    }
    return row;
  });

  const preferenceRows = PREFERENCE_ROWS.map((row) =>
    row.id === "language" ? { ...row, value: languageLabel } : row,
  );

  const developerRows: SettingsRow[] = __DEV__
    ? [
        {
          id: "leak-intelligence-debug",
          label: "Leak Intelligence (debug)",
          value: "Dev only",
          Icon: FlaskConical,
          href: LEAK_INTELLIGENCE_DEBUG_HREF,
        },
        {
          id: "financial-reasoning-debug",
          label: "Financial Reasoning (debug)",
          value: "Dev only",
          Icon: FlaskConical,
          href: FINANCIAL_REASONING_DEBUG_HREF,
        },
      ]
    : [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View>
            <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
              Profile
            </Text>
            <Text className="mt-1 mb-5 text-[14px] leading-5 text-muted-foreground">
              Your TracePay account and preferences
            </Text>
          </View>


          {error ? (
            <Pressable
              accessibilityRole="button"
              className="mt-2 self-start px-1"
              disabled={loading}
              hitSlop={8}
              onPress={retry}
            >
              <Text className="text-[13px] font-semibold text-primary">
                Retry loading profile
              </Text>
            </Pressable>
          ) : null}

          <SettingsSection
            title="Account"
            rows={accountRows}
            palette={palette}
          />
          <SettingsSection
            title="Preferences"
            rows={preferenceRows}
            palette={palette}
          />
          {developerRows.length > 0 ? (
            <SettingsSection
              title="Developer"
              rows={developerRows}
              palette={palette}
            />
          ) : null}

          <Button
            className="mt-6"
            loading={loggingOut}
            onPress={handleLogout}
            size="md"
            variant="destructive"
          >
            <>
              <LogOut color={palette.destructive} size={18} strokeWidth={2.2} />
              <Text className="text-[15px] font-semibold text-destructive">
                Log out
              </Text>
            </>
          </Button>

          <Text className="mt-6 text-center text-[12px] text-muted-foreground">
            TracePay · Version {APP_VERSION}
          </Text>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
