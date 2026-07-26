import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { cn } from "@/lib/cn";
import { getSeverityStyle } from "@/lib/severity";
import type { Leak } from "@/stores/leaksStore";

type LeakActionModalProps = {
  leak: Leak | null;
  visible: boolean;
  onClose: () => void;
};

function titleCase(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function LeakActionModal({ leak, visible, onClose }: LeakActionModalProps) {
  const { colors } = useColorScheme();
  const { insets } = useScreenInsets("compact");
  const severity = getSeverityStyle(titleCase(leak?.severity ?? "medium"));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/45" onPress={onClose}>
        <Pressable
          className="surface-panel max-h-[78%] rounded-t-3xl px-5 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          onPress={() => {}}
        >
          <View className="mb-4 items-center">
            <View className="h-1.5 w-12 rounded-full bg-border dark:bg-white/15" />
          </View>

          {leak ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="mb-4 flex-row items-start gap-3">
                <View
                  className={cn(
                    "h-12 w-12 items-center justify-center rounded-2xl",
                    severity.badge,
                  )}
                >
                  <MaterialCommunityIcons
                    name={(leak.categoryIcon as any) ?? "alert-circle-outline"}
                    size={24}
                    color={severity.icon}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <AppText variant="titleMd" numberOfLines={2}>
                    {leak.name}
                  </AppText>
                  <AppText variant="caption" className="mt-1">
                    {leak.fiCode ?? leak.category} · {titleCase(leak.status)}
                  </AppText>
                </View>
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={onClose}
                  className="min-h-0 h-[34px] w-[34px] rounded-full bg-muted dark:bg-white/10"
                >
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </Button>
              </View>

              <View className="mb-4 rounded-2xl bg-muted/70 px-4 py-3 dark:bg-white/5">
                <AppText variant="caption" className="mb-1 text-muted-foreground">
                  Monthly impact
                </AppText>
                <AppText variant="title" className="text-red-600 dark:text-red-400">
                  -R{leak.amountMonthly.toFixed(2)}
                </AppText>
              </View>

              <AppText variant="overline" className="mb-2">
                Recommended action
              </AppText>
              <AppText variant="body" className="leading-6">
                {leak.advice?.trim() || "No action available for this leak yet."}
              </AppText>
            </ScrollView>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
