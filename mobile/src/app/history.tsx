import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";

interface Transaction {
  id: string;
  name: string;
  date: string;
  source: string;
  amount: string;
  isLeak: boolean;
  tags: string[];
}

const GROUPED_TRANSACTIONS: { dateLabel: string; items: Transaction[] }[] = [
  {
    dateLabel: "MONDAY, 20 APRIL",
    items: [
      { id: "1", name: "Cash Payment - S. Nkosi", date: "20 Apr", source: "S. Nkosi", amount: "-R350", isLeak: true, tags: ["Bank", "Mashonisa"] },
      { id: "2", name: "MTN Airtime Advance", date: "20 Apr", source: "MTN Advance", amount: "-R11", isLeak: true, tags: ["Mobile", "Airtime"] },
    ],
  },
  {
    dateLabel: "SUNDAY, 19 APRIL",
    items: [
      { id: "3", name: "ATM Withdrawal - Capite...", date: "19 Apr", source: "Capitec ATM EL CBD", amount: "-R300", isLeak: true, tags: ["Bank", "ATM Fee"] },
    ],
  },
  {
    dateLabel: "SATURDAY, 18 APRIL",
    items: [
      { id: "4", name: "Taxi Fare - Mdantsane", date: "18 Apr", source: "MoMo Transfer", amount: "-R25", isLeak: false, tags: ["Mobile", "Transport"] },
      { id: "5", name: "MTN Airtime Advance", date: "18 Apr", source: "MTN Advance", amount: "-R11", isLeak: true, tags: ["Mobile", "Airtime"] },
    ],
  },
];

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [search, setSearch] = useState("");

  const filtered = search
    ? GROUPED_TRANSACTIONS.map((g) => ({
        ...g,
        items: g.items.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())),
      })).filter((g) => g.items.length > 0)
    : GROUPED_TRANSACTIONS;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: isWeb ? 67 + 16 : insets.top + 16,
            paddingBottom: isWeb ? 34 + 80 : 40 + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Transaction History</Text>
            <Text style={styles.subtitle}>All your financial activity in one place</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Feather name="search" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search transactions..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <TouchableOpacity style={styles.filterBtn}>
            <Feather name="alert-triangle" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {filtered.map((group) => (
          <View key={group.dateLabel} style={styles.group}>
            <Text style={styles.dateLabel}>{group.dateLabel}</Text>
            {group.items.map((tx) => (
              <View key={tx.id} style={styles.txCard}>
                <View style={[styles.txIcon, tx.isLeak ? styles.txIconLeak : styles.txIconNormal]}>
                  {tx.isLeak ? (
                    <Feather name="alert-triangle" size={16} color="#DC2626" />
                  ) : (
                    <Feather name="arrow-up-right" size={16} color="#6B7280" />
                  )}
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txName}>{tx.name}</Text>
                  <View style={styles.txTagsRow}>
                    {tx.tags.map((tag) => (
                      <View key={tag} style={styles.txTag}>
                        <Text style={styles.txTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.txRight}>
                  <Text style={styles.txAmount}>{tx.amount}</Text>
                  {tx.isLeak && (
                    <View style={styles.leakDetectedBadge}>
                      <Text style={styles.leakDetectedText}>Leak detected</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F6FB" },
  content: { paddingHorizontal: 18 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  headerText: {},
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 2 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6B7280" },
  searchRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#111827",
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  group: { marginBottom: 8 },
  dateLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  txIconLeak: { backgroundColor: "#FEE2E2" },
  txIconNormal: { backgroundColor: "#F3F4F6" },
  txInfo: { flex: 1 },
  txName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 6 },
  txTagsRow: { flexDirection: "row", gap: 6 },
  txTag: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  txTagText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#374151" },
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#111827" },
  leakDetectedBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  leakDetectedText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
});
