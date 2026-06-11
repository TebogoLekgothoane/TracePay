import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Animated,
  ActivityIndicator,
  AppState,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useIngestion } from "@/context/SMSIngestionContext";
import { cn } from "@/lib/cn";

export default function SmsScanningScreen() {
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === "1";

  const { syncNow, isLoading, error, state, transactions, openPermissionSettings, refreshPermission } =
    useIngestion();

  const [phase, setPhase] = useState<"preparing" | "reading" | "analysing" | "done" | "failed">("preparing");
  const [scanError, setScanError] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const hasStarted = useRef(false);

  const animateTo = useCallback(
    (toValue: number, duration: number) =>
      new Promise<void>((resolve) => {
        Animated.timing(progressAnim, {
          toValue,
          duration,
          useNativeDriver: false,
        }).start(() => resolve());
      }),
    [progressAnim],
  );

  const runScan = useCallback(async () => {
    setScanError(null);
    setPhase("preparing");
    await animateTo(0.15, 400);

    setPhase("reading");
    await animateTo(0.35, 600);

    setPhase("analysing");
    animateTo(0.85, 4000);
    const ok = await syncNow();

    if (!ok) {
      progressAnim.stopAnimation();
      setPhase("failed");
      return;
    }

    setPhase("done");
    await animateTo(1.0, 400);

    router.replace({
      pathname: "/sms-results",
      params: fromOnboarding ? { fromOnboarding: "1" } : {},
    });
  }, [syncNow, animateTo, fromOnboarding, progressAnim]);

  const handleRetry = useCallback(() => {
    hasStarted.current = false;
    progressAnim.setValue(0);
    hasStarted.current = true;
    runScan();
  }, [runScan, progressAnim]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runScan();
  }, [runScan]);

  useEffect(() => {
    if (phase === "failed" && error) {
      setScanError(error);
    }
  }, [phase, error]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && phase === "failed") {
        void refreshPermission().then((status) => {
          if (status === "granted") {
            handleRetry();
          }
        });
      }
    });
    return () => sub.remove();
  }, [phase, refreshPermission, handleRetry]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const phaseLabels = {
    preparing:  "Preparing SMS service…",
    reading:    "Reading messages from inbox…",
    analysing:  "Parsing bank transactions…",
    done:       `Done — ${state.totalIngested} transaction${state.totalIngested !== 1 ? "s" : ""} ingested`,
    failed:     "Scanning failed",
  };

  const displayError = scanError ?? error;

  const recentTx = transactions.slice(0, 5);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen bottomInset="compact">
        <View className="flex-row items-start flex-wrap gap-2.5 mb-[18px]">
          {!fromOnboarding ? (
            <Button
              variant="outline"
              size="icon"
              onPress={() => router.back()}
              className="back-btn"
            >
              <Feather name="arrow-left" size={22} color="#111827" />
            </Button>
          ) : null}
          <View className="flex-1 min-w-[140px]">
            <Text className="text-[22px] font-bold text-gray-900 mb-0.5">Scanning SMS Inbox</Text>
            <Text className="body-text">{phaseLabels[phase]}</Text>
          </View>
          {state.totalIngested > 0 && (
            <View className="badge-success flex-row items-center self-start py-1.5">
              <Feather name="check-circle" size={13} color="#16A34A" />
              <Text className="text-[13px] font-semibold text-green-600"> {state.totalIngested}</Text>
            </View>
          )}
        </View>

        <View className="h-1.5 bg-gray-200 rounded-sm mb-3.5 overflow-hidden">
          <Animated.View
            className="progress-fill progress-fill-purple h-full"
            style={{ width: progressWidth }}
          />
        </View>

        <View className="flex-row items-center gap-2 mb-[18px]">
          {phase === "failed" ? (
            <>
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <Text className="text-sm font-sans text-red-600">{phaseLabels.failed}</Text>
            </>
          ) : phase !== "done" ? (
            <>
              <ActivityIndicator size="small" color="#7C3AED" />
              <Text className="text-sm font-sans text-gray-700">{phaseLabels[phase]}</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color="#16A34A" />
              <Text className="text-sm font-sans text-green-600">
                Ingested {state.totalIngested} transaction{state.totalIngested !== 1 ? "s" : ""}
              </Text>
            </>
          )}
        </View>

        {displayError && (
          <View className="flex-row items-start bg-red-100 rounded-[10px] p-3 mb-3.5">
            <Feather name="alert-circle" size={14} color="#DC2626" />
            <Text className="text-[13px] font-sans text-red-600 flex-1 flex-wrap"> {displayError}</Text>
          </View>
        )}

        {phase === "failed" && (
          <View className="gap-2.5 mb-2">
            <Button
              variant="accent"
              fullWidth
              onPress={openPermissionSettings}
              icon={<Feather name="settings" size={16} color="#fff" />}
            >
              Open Settings
            </Button>
            <Button
              variant="destructive"
              fullWidth
              onPress={handleRetry}
              icon={<Feather name="refresh-cw" size={16} color="#fff" />}
            >
              Try again
            </Button>
          </View>
        )}

        {recentTx.map((tx) => (
          <View key={tx.id} className="bg-white rounded-[14px] p-3.5 mb-3 shadow-sm">
            <View className="flex-row items-center mb-2">
              <View
                className={cn(
                  "w-8 h-8 rounded-lg items-center justify-center mr-2",
                  tx.type === "debit" ? "bg-red-100" : "bg-green-100",
                )}
              >
                <MaterialCommunityIcons
                  name="message-text-outline"
                  size={16}
                  color={tx.type === "debit" ? "#DC2626" : "#16A34A"}
                />
              </View>
              <Text className="flex-1 text-[15px] font-semibold text-gray-900">{tx.bank}</Text>
              <Text className="caption">
                {tx.timestamp instanceof Date
                  ? tx.timestamp.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
                  : ""}
              </Text>
            </View>
            <Text className="text-sm font-sans text-gray-700 leading-5 mb-2" numberOfLines={2}>
              {tx.merchant ?? tx.reference ?? tx.rawBody}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className={cn("text-sm font-bold", tx.type === "debit" ? "text-red-600" : "text-green-600")}>
                {tx.type === "debit" ? "-" : "+"}R{tx.amount.toFixed(2)}
              </Text>
              <View className="bg-violet-100 rounded-md px-2 py-0.5">
                <Text className="text-[11px] font-medium text-brand-purple">{tx.category}</Text>
              </View>
            </View>
          </View>
        ))}

        {isLoading && recentTx.length === 0 && (
          <View className="items-center py-12 gap-4">
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text className="body-text">Reading your bank SMS messages…</Text>
          </View>
        )}
      </Screen>
    </>
  );
}
