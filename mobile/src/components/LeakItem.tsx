import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

interface LeakItemProps {
  name: string;
  category: string;
  amount: string;
  period?: string;
  onPress?: () => void;
  iconName?: string;
}

export default function LeakItem({
  name,
  category,
  amount,
  period = "/month",
  onPress,
}: LeakItemProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconWrapper}>
        <MaterialCommunityIcons name="credit-card-outline" size={20} color="#7C3AED" />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.category}>{category}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>{amount}</Text>
        <Text style={styles.period}>{period}</Text>
      </View>
      <Feather name="chevron-right" size={16} color="#9CA3AF" style={styles.chevron} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
    marginBottom: 2,
  },
  category: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },
  right: {
    alignItems: "flex-end",
    marginRight: 6,
  },
  amount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#DC2626",
  },
  period: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },
  chevron: {
    marginLeft: 2,
  },
});
