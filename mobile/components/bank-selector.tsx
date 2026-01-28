import React from "react";
import { ScrollView, View } from "react-native";
import { Bank, BankCard } from "@/components/bank-card";
import { ThemedText } from "@/components/themed-text";

export function BankSelector({
  banks,
  onSelect,
}: {
  banks: Bank[];
  onSelect: (bank: Bank) => void;
}) {
  return (
    <View className="w-full">
      <ThemedText type="h3" className="text-text mb-3">
        Select a bank
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {banks.map((bank) => (
          <BankCard key={bank.id} bank={bank} onPress={() => onSelect(bank)} />
        ))}
      </ScrollView>
    </View>
  );
}

