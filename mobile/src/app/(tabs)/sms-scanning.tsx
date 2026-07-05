import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Animated,
  AppState,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { SmsScanningListSkeleton } from "@/components/ScreenSkeletons";
import { FadeInItem, SkeletonPlaceholder } from "@/components/ContentTransition";
import { TransactionRow } from "@/components/TransactionRow";
import { AppText } from "@/components/Typography";
import { router, useLocalSearchParams } from "expo-router";
import { useIngestion } from "@/context/SMSIngestionContext";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function SmsScanningScreen() {
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === "1";

  const { syncNow, isLoading, error, state, transactions, openPermissionSettings, refreshPermission } =
    useIngestion();
  const { colors } = useColorScheme();

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
      pathname: "/(tabs)/sms-results",
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
    preparing: "Preparing SMS service…",
    reading: "Reading messages from inbox…",
    analysing: "Parsing bank transactions…",
    done: `Done — ${state.totalIngested} transaction${state.totalIngested !== 1 ? "s" : ""} ingested`,
    failed: "Scanning failed",
  };

  const displayError = scanError ?? error;
  const recentTx = transactions.slice(0, 5);

  return (
    <Screen>
      <View className="mb-6 flex-row items-start gap-3">
        {!fromOnboarding ? (
          <Button
            variant="outline"
            size="icon"
            onPress={() => router.back()}
            className="back-btn"
          >
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Button>
        ) : null}
        <View className="min-w-0 flex-1">
          <AppText variant="titleLg">Scanning SMS Inbox</AppText>
          <AppText variant="lead" className="mt-1">
            {phaseLabels[phase]}
          </AppText>
        </View>
        {state.totalIngested > 0 ? (
          <View className="badge-success flex-row items-center self-start py-1.5">
            <Feather name="check-circle" size={13} color={colors.success} />
            <AppText variant="label" className="ml-1 text-green-600 dark:text-green-400">
              {state.totalIngested}
            </AppText>
          </View>
        ) : null}
      </View>

      <View className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted dark:bg-white/10">
        <Animated.View
          className="progress-fill progress-fill-purple h-full"
          style={{ width: progressWidth }}
        />
      </View>

      {phase === "failed" ? (
        <View className="mb-5 flex-row items-center gap-2">
          <Feather name="alert-circle" size={18} color={colors.destructive} />
          <AppText variant="bodySm" className="text-destructive">
            {phaseLabels.failed}
          </AppText>
        </View>
      ) : null}

      {displayError ? (
        <Card glass={false} className="mb-4 border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20">
          <View className="flex-row items-start gap-2">
            <Feather name="alert-circle" size={16} color={colors.destructive} />
            <AppText variant="bodySm" className="flex-1 text-destructive">
              {displayError}
            </AppText>
          </View>
        </Card>
      ) : null}

      {phase === "failed" ? (
        <View className="mb-4 gap-3">
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
      ) : null}

      {isLoading && recentTx.length === 0 ? (
        <SkeletonPlaceholder>
          <SmsScanningListSkeleton count={4} />
        </SkeletonPlaceholder>
      ) : (
        recentTx.map((tx, index) => (
          <FadeInItem key={tx.id} index={index}>
            <TransactionRow className="mb-3" tx={tx} showMeta />
          </FadeInItem>
        ))
      )}
    </Screen>
  );
}
