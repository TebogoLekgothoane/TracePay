import React from "react";
import { Pressable, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { formatZar } from "@/components/utils/money";

export type AutopsyCause = {
  id: string;
  title: string;
  amount: number;
  percentOfIncome: number;
};

export function AutopsyCauseList({
  causes,
  onSelect,
}: {
  causes: AutopsyCause[];
  onSelect?: (cause: AutopsyCause) => void;
}) {
  return (
    <View className="w-full mt-4">
      <ThemedText type="h3" className="text-text mb-3">
        Causes
      </ThemedText>
      <View className="bg-bg-card rounded-2xl overflow-hidden">
        {causes.map((cause, idx) => (
          <Pressable
            key={cause.id}
            onPress={() => onSelect?.(cause)}
            className={[
              "px-5 py-4",
              idx === 0 ? "" : "border-t border-black/5",
            ].join(" ")}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <ThemedText type="h4" className="text-text">
                  {cause.title}
                </ThemedText>
                <ThemedText type="small" className="text-text-muted mt-1">
                  {cause.percentOfIncome}% of income
                </ThemedText>
              </View>
              <ThemedText type="h4" className="text-text">
                {formatZar(cause.amount)}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

