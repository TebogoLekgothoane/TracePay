import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AssembledTracePayIcon from "../../../assets/icons/assembled TracePay icon.svg";
import PayWordmark from "../../../assets/wordmark/PAY.svg";
import TraceWordmark from "../../../assets/wordmark/trace white wordmark.svg";
import { TRACEPAY } from "../../theme/colors";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { TRACEPAY_ICON_COMPOSITION } from "../tracePayIconComposition";
import { continueAfterAuth } from "../../features/auth/auth.navigation";
import { getPendingPhone } from "../../features/auth/auth.service";
import { useAppLock } from "../../features/security/AppLockProvider";
import { useAuth } from "../../hooks/useAuth";
import { WelcomeAuthForm, type WelcomeAuthMode, type WelcomeAuthPayload } from "./WelcomeAuthForm";

const SUBTITLE = "Take control of your money.\nFind the leaks. Save your money.";

type Panel = "welcome" | WelcomeAuthMode;

function usePalette() {
  const { colorScheme } = useColorScheme();
  return TRACEPAY[colorScheme === "dark" ? "dark" : "light"];
}

function WelcomeWordmark({ width }: { width: number }) {
  const palette = usePalette();
  const height = width * (632 / 1897);
  const columnWidth = (width - 8) / 2;

  return (
    <View
      accessibilityLabel="TRACEPAY"
      className="relative mt-3"
      style={{ width, height }}
    >
      <View className="absolute left-0 top-0" style={{ width: columnWidth, height }}>
        <TraceWordmark
          width={columnWidth}
          height={height}
          color={palette.foreground}
          preserveAspectRatio="xMidYMid meet"
        />
      </View>
      <View
        className="absolute top-0"
        style={{ left: columnWidth - 12, width: columnWidth, height }}
      >
        <PayWordmark
          width={columnWidth}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
      </View>
    </View>
  );
}

function WelcomeLogo({ size, wordmarkWidth }: { size: number; wordmarkWidth: number }) {
  const palette = usePalette();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const height =
    size * (TRACEPAY_ICON_COMPOSITION.height / TRACEPAY_ICON_COMPOSITION.width);

  return (
    <View className="items-center">
      <View
        accessibilityLabel="TracePay"
        className="items-center justify-center"
        style={{
          width: size,
          height,
          shadowColor: palette.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isDark ? 0.55 : 0.28,
          shadowRadius: 28,
          elevation: isDark ? 18 : 10,
        }}
      >
        <AssembledTracePayIcon
          width={size}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
      </View>
      <WelcomeWordmark width={wordmarkWidth} />
    </View>
  );
}

export function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const palette = usePalette();
  const logoSize = Math.min(width * 0.52, 210);
  const wordmarkWidth = Math.min(width * 0.78, 300);
  const sheetHeight = Math.min(height * 0.72, 640);

  const { error, requestReset, setError, signIn, signUp, submitting } = useAuth();
  const { hasPin, lockApp, unlockApp } = useAppLock();
  const [panel, setPanel] = useState<Panel>("welcome");
  const [formMode, setFormMode] = useState<WelcomeAuthMode>("create");
  const isWelcome = panel === "welcome";

  const continueAfterLogin = () => {
    void continueAfterAuth({ hasPin, lockApp, router, unlockApp });
  };

  const openPanel = (next: WelcomeAuthMode) => {
    if (panel !== "welcome") {
      return;
    }

    setFormMode(next);
    setPanel(next);
  };

  const switchMode = (next: WelcomeAuthMode) => {
    if (panel === "welcome" || submitting) {
      return;
    }

    setError(null);
    setFormMode(next);
    setPanel(next);
  };

  const closePanel = () => {
    if (panel === "welcome" || submitting) {
      return;
    }

    setError(null);
    setPanel("welcome");
  };

  const handleBack = () => {
    if (formMode === "forgot") {
      switchMode("login");
      return;
    }
    closePanel();
  };

  const submitForm = async (payload: WelcomeAuthPayload) => {
    if (submitting || panel === "welcome") {
      return;
    }

    try {
      if (panel === "forgot") {
        await requestReset(payload.phone);
        router.push({
          pathname: "/(auth)/otp",
          params: {
            phone: getPendingPhone() ?? payload.phone,
            flow: "reset",
          },
        });
        return;
      }

      if (panel === "create") {
        await signUp({
          fullName: payload.name ?? "",
          phone: payload.phone,
          password: payload.password ?? "",
        });
        router.push({
          pathname: "/(auth)/otp",
          params: {
            phone: getPendingPhone() ?? payload.phone,
            flow: "signup",
          },
        });
        return;
      }

      const result = await signIn({
        phone: payload.phone,
        password: payload.password ?? "",
      });

      if (result.requiresOtp) {
        router.push({
          pathname: "/(auth)/otp",
          params: {
            phone: getPendingPhone() ?? payload.phone,
            flow: "login",
          },
        });
        return;
      }

      continueAfterLogin();
    } catch {
      return;
    }
  };

  return (
    <View
      style={[styles.flex, { backgroundColor: palette.background }]}
    >
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <View style={styles.flex}>
          <View className="items-center pt-10">
            <WelcomeLogo size={logoSize} wordmarkWidth={wordmarkWidth} />
          </View>

          {isWelcome ? (
            <View style={styles.flex}>
              <View className="mt-10 items-center px-7">
                <Text className="text-center text-[32px] font-medium text-foreground">
                  Welcome
                </Text>
                <Text className="mt-3 text-center text-[16px] leading-[24px] text-muted-foreground">
                  {SUBTITLE}
                </Text>
              </View>

              <View style={styles.flex} />

              <View className="gap-3.5 px-7 pb-10">
                <Button arrow onPress={() => openPanel("create")}>
                  Create Account
                </Button>
                <Button
                  arrow
                  variant="outline"
                  onPress={() => openPanel("login")}
                >
                  Log In
                </Button>
              </View>
            </View>
          ) : (
            <View style={styles.flex}>
              <View style={styles.backButton}>
                <IconButton
                  accessibilityLabel={formMode === "forgot" ? "Back to log in" : "Back to welcome"}
                  hitSlop={12}
                  variant="ghost"
                  onPress={handleBack}
                >
                  <Ionicons
                    color={palette.foreground}
                    name="chevron-back"
                    size={22}
                  />
                </IconButton>
              </View>

              <View
                className="overflow-hidden bg-card px-7 pt-8"
                style={[styles.sheet, { height: sheetHeight }]}
              >
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                  style={styles.flex}
                >
                  <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.sheetContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    <WelcomeAuthForm
                      error={error}
                      mode={formMode}
                      submitting={submitting}
                      onSubmit={submitForm}
                      onSwitchMode={switchMode}
                    />
                  </ScrollView>
                </KeyboardAvoidingView>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    left: 8,
    top: 4,
    zIndex: 50,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  sheetContent: {
    paddingBottom: 40,
  },
});
