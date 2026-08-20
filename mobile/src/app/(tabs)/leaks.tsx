import React, { useEffect, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { LeakActionModal } from "@/components/LeakActionModal";
import { ScreenFrame } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { cn } from "@/lib/cn";
import { goBackOr } from "@/lib/navigation";
import { getSeverityStyle } from "@/lib/severity";
import {
  getActiveLeakStats,
  useLeaksStore,
  type Leak,
} from "@/stores/leaksStore";

function titleCase(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export default function ActiveLeaksScreen() {
  const { contentPadding } = useScreenInsets("tab");
  const { colors } = useColorScheme();
  const { leaks, fetchLeaks, isLoading } = useLeaksStore();
  const [selectedLeak, setSelectedLeak] = useState<Leak | null>(null);

  useEffect(() => {
    void fetchLeaks();
  }, [fetchLeaks]);

  const { activeLeaks, totalMonthly } = getActiveLeakStats(leaks);

  return (
    <ScreenFrame>
      <FlatList
        data={activeLeaks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={contentPadding}
        contentContainerClassName="screen-content pb-8"
        ListHeaderComponent={
          <View className="mb-5 flex-row items-start gap-3">
            <Button
              variant="outline"
              size="icon"
              onPress={() => goBackOr("/(tabs)")}
              className="back-btn"
            >
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </Button>
            <View className="min-w-0 flex-1">
              <AppText variant="titleLg">Active leaks</AppText>
              <AppText variant="bodySm" className="mt-0.5">
                {activeLeaks.length} active · R{totalMonthly.toFixed(2)}/mo
              </AppText>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            description={
              isLoading
                ? "Loading leaks…"
                : "No active leaks right now. Scan your SMS inbox to refresh detection."
            }
            onPress={isLoading ? undefined : () => router.push("/(tabs)/sms-scanning")}
            icon={
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={28}
                color={colors.mutedForeground}
              />
            }
          />
        }
        renderItem={({ item }) => {
          const severity = getSeverityStyle(titleCase(item.severity));
          return (
            <Pressable
              onPress={() => setSelectedLeak(item)}
              className="mb-3 active:opacity-90"
            >
              <Card className="p-0" contentClassName="flex-row items-center gap-3 px-4 py-3.5">
                <View
                  className={cn(
                    "h-11 w-11 items-center justify-center rounded-xl",
                    severity.badge,
                  )}
                >
                  <MaterialCommunityIcons
                    name={(item.categoryIcon as any) ?? "alert-circle-outline"}
                    size={20}
                    color={severity.icon}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <AppText variant="label" numberOfLines={1}>
                    {item.name}
                  </AppText>
                  <AppText variant="caption" className="mt-0.5" numberOfLines={2}>
                    {item.advice?.trim() || item.fiCode || item.category}
                  </AppText>
                </View>
                <View className="items-end gap-1">
                  <AppText variant="label" className="text-red-600 dark:text-red-400">
                    -R{item.amountMonthly.toFixed(2)}
                  </AppText>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      <LeakActionModal
        leak={selectedLeak}
        visible={selectedLeak != null}
        onClose={() => setSelectedLeak(null)}
      />
    </ScreenFrame>
  );
}
