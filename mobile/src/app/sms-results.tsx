import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore } from "@/stores/leaksStore";

interface LeakResult {
  name: string;
  category: string;
  categoryIcon: string;
  severity: "High" | "Medium" | "Low";
  amountMonthly: number;
  detail?: string;
  sourceSms?: string;
  advice?: string;
}

const FALLBACK_LEAKS: LeakResult[] = [
  {
    name: "iflix Subscription",
    category: "Zombie Subscription",
    categoryIcon: "television-play",
    severity: "Medium",
    amountMonthly: 49.99,
    sourceSms: "MTN: R49.99 deducted for iflix subscription.",
    advice: "Dial *141*9# on your MTN SIM right now to cancel iflix — you'll stop the R49.99 deduction before your next billing cycle.",
  },
  {
    name: "Capitec Loan Interest",
    category: "Loan Interest",
    categoryIcon: "cash",
    severity: "High",
    amountMonthly: 87.50,
    sourceSms: "Capitec: R350.00 deducted. Loan repayment + R87.50 interest. Acc ...4821",
    advice: "Visit your nearest Capitec branch to restructure this loan — requesting a shorter term reduces total interest paid by up to 40%.",
  },
  {
    name: "Vodacom Airtime Advance Fee",
    category: "Airtime Advance Fee",
    categoryIcon: "phone",
    severity: "High",
    amountMonthly: 32.4,
    sourceSms: "Vodacom: Airtime advance of R30.00 approved. Fee: R5.40. Repayable on recharge.",
    advice: "Buy a R30 Vodacom data bundle in advance via the MyVodacom app — you avoid the 18% advance fee and the bundle lasts longer.",
  },
];

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  High: { bg: "#FEE2E2", text: "#DC2626" },
  Medium: { bg: "#FEF3C7", text: "#D97706" },
  Low: { bg: "#FEF9C3", text: "#CA8A04" },
};

export default function SmsResultsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const params = useLocalSearchParams<{ data?: string; fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === "1";
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);
  const addLeaks = useLeaksStore((s) => s.addLeaks);
  const [expandedLeak, setExpandedLeak] = useState<number | null>(0);

  const parsedData = params.data
    ? (() => {
        try {
          return JSON.parse(decodeURIComponent(params.data));
        } catch {
          return null;
        }
      })()
    : null;

  const rawLeaks: LeakResult[] = parsedData?.leaks?.length
    ? parsedData.leaks
    : FALLBACK_LEAKS;

  const totalMonthly = rawLeaks.reduce((sum, l) => sum + l.amountMonthly, 0);

  const goToHome = async () => {
    if (rawLeaks.length > 0) {
      await addLeaks(
        rawLeaks.map((l) => ({
          name: l.name,
          category: l.category,
          categoryIcon: l.categoryIcon,
          amountMonthly: l.amountMonthly,
          severity: l.severity,
          status: "active",
          sourceSms: l.sourceSms,
          advice: l.advice,
        })),
      );
    }
    await completeOnboarding();
    router.replace("/(tabs)");
  };

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
          {!fromOnboarding ? (
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color="#111827" />
            </TouchableOpacity>
          ) : null}
          <View>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="message-text-outline" size={20} color="#7C3AED" />
              <Text style={styles.title}> SMS Scan Results</Text>
            </View>
            <Text style={styles.subtitle}>AI found {rawLeaks.length} money leaks in your SMS history</Text>
          </View>
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>TOTAL LEAKING MONTHLY</Text>
          <Text style={styles.totalAmount}>R{totalMonthly.toFixed(2)}</Text>
          <Text style={styles.totalYearly}>That's R{(totalMonthly * 12).toFixed(0)} lost every year</Text>
        </View>

        <Text style={styles.detectedTitle}>DETECTED LEAKS</Text>

        {rawLeaks.map((leak, idx) => {
          const sev = SEVERITY_COLORS[leak.severity] ?? SEVERITY_COLORS.Low;
          const isExpanded = expandedLeak === idx;
          return (
            <View key={idx} style={[styles.leakCard, isExpanded && styles.leakCardExpanded]}>
              <TouchableOpacity
                style={styles.leakRow}
                activeOpacity={0.7}
                onPress={() => setExpandedLeak(isExpanded ? null : idx)}
              >
                <View style={[styles.iconCircle, { backgroundColor: sev.bg }]}>
                  <MaterialCommunityIcons name={leak.categoryIcon as any} size={18} color={sev.text} />
                </View>
                <View style={styles.leakInfo}>
                  <Text style={styles.leakName} numberOfLines={1}>{leak.name}</Text>
                  <View style={styles.leakMeta}>
                    <Text style={styles.leakCategory}>{leak.category} · </Text>
                    <View style={[styles.severityBadge, { backgroundColor: sev.bg }]}>
                      <Text style={[styles.severityText, { color: sev.text }]}>{leak.severity}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.leakAmount}>R{leak.amountMonthly.toFixed(2)}/mo</Text>
                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
              </TouchableOpacity>

              {!isExpanded && (
                <View style={styles.leakCollapsed}>
                  <Text style={styles.collapsedText} numberOfLines={2}>
                    {leak.advice ?? leak.sourceSms ?? "Tap to see the SMS evidence and next step."}
                  </Text>
                </View>
              )}

              {isExpanded && (
                <View style={styles.leakExpanded}>
                  {leak.sourceSms && (
                    <View style={styles.smsBox}>
                      <MaterialCommunityIcons name="message-text-outline" size={13} color="#6B7280" />
                      <Text style={styles.sourceText}> {leak.sourceSms}</Text>
                    </View>
                  )}
                  {leak.advice && (
                    <View style={styles.adviceBox}>
                      <MaterialCommunityIcons name="star-four-points-outline" size={14} color="#7C3AED" />
                      <Text style={styles.adviceText}> {leak.advice}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {fromOnboarding ? (
          <TouchableOpacity
            style={styles.homeBtn}
            activeOpacity={0.85}
            onPress={goToHome}
          >
            <MaterialCommunityIcons name="home-outline" size={20} color="#fff" />
            <Text style={styles.homeBtnText}> Go to home</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F6FB" },
  content: { paddingHorizontal: 18 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18 },
  backBtn: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center", marginTop: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#111827" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280" },
  totalCard: {
    backgroundColor: "#DC2626", borderRadius: 16, padding: 20, marginBottom: 22,
    shadowColor: "#DC2626", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  totalLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.75)", letterSpacing: 1.2, marginBottom: 6 },
  totalAmount: { fontSize: 40, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 6 },
  totalYearly: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },
  detectedTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#6B7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 },
  leakCard: {
    backgroundColor: "#FFFFFF", borderRadius: 14, marginBottom: 10, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  leakCardExpanded: { borderWidth: 1.5, borderColor: "#C4B5FD" },
  leakRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  leakInfo: { flex: 1 },
  leakName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 4 },
  leakMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  leakCategory: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },
  severityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  severityText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  leakAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#DC2626", marginRight: 4 },
  leakCollapsed: { paddingHorizontal: 14, paddingBottom: 14 },
  collapsedText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 19 },
  leakExpanded: { paddingHorizontal: 14, paddingBottom: 16, borderTopWidth: 1, borderTopColor: "#EDE9FE", gap: 10 },
  smsBox: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "#F9FAFB", borderRadius: 8, padding: 10, marginTop: 10,
  },
  sourceText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", flex: 1, lineHeight: 18 },
  adviceBox: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "#F5F3FF", borderRadius: 10, padding: 12,
  },
  adviceText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#5B21B6", flex: 1, lineHeight: 19, flexWrap: "wrap" },
  homeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingVertical: 17,
    marginTop: 16,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  homeBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
});
