import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

const SCAN_SOURCES = [
  { id: "1", name: "Capitec", preview: "R8.00 fee charged for ATM withdrawal..." },
  { id: "2", name: "MTN", preview: "R49.99 deducted for iflix subscription..." },
  { id: "3", name: "Vodacom", preview: "Airtime advance: R30.00 + R5.40 fee..." },
  { id: "4", name: "ABSA", preview: "Debit order R199: Gym (unused 4 months)..." },
];

export default function SmsScanScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: isWeb ? 67 + 16 : insets.top + 16,
          paddingBottom: isWeb ? 34 + 80 : 80 + insets.bottom,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Money Leak Scanner</Text>
      <Text style={styles.subtitle}>Find out what's draining your airtime & money</Text>

      <View style={styles.analysisCard}>
        <View style={styles.analysisIconBox}>
          <MaterialCommunityIcons name="message-text" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.analysisTitle}>Bank SMS Analysis</Text>
        <Text style={styles.analysisPowered}>Powered by TracePay AI</Text>
        <Text style={styles.analysisDesc}>
          TracePay scans your Capitec, ABSA, FNB, MTN and Vodacom notification SMSes to spot recurring fees, zombie subscriptions and hidden charges.
        </Text>
        <View style={styles.readOnlyBadge}>
          <MaterialCommunityIcons name="shield-check-outline" size={14} color="#FFFFFF" />
          <Text style={styles.readOnlyText}> Read-only · Nothing is shared externally</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>WHAT WE'LL SCAN</Text>

      {SCAN_SOURCES.map((source) => (
        <View key={source.id} style={styles.sourceCard}>
          <View style={styles.sourceIcon}>
            <MaterialCommunityIcons name="message-text-outline" size={20} color="#7C3AED" />
          </View>
          <View style={styles.sourceInfo}>
            <Text style={styles.sourceName}>{source.name}</Text>
            <Text style={styles.sourcePreview}>{source.preview}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.moreText}>+ dozens more from your inbox...</Text>

      <TouchableOpacity
        style={styles.scanBtn}
        activeOpacity={0.85}
        onPress={() => router.push("/sms-scanning" as any)}
      >
        <MaterialCommunityIcons name="lightning-bolt" size={20} color="#FFFFFF" />
        <Text style={styles.scanBtnText}> Scan My SMS Inbox →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F6FB" },
  content: { paddingHorizontal: 18 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6B7280", marginBottom: 18 },
  analysisCard: {
    backgroundColor: "#7C3AED",
    borderRadius: 16,
    padding: 20,
    marginBottom: 22,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  analysisIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  analysisTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 2 },
  analysisPowered: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginBottom: 14 },
  analysisDesc: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#FFFFFF", lineHeight: 22, marginBottom: 16 },
  readOnlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  readOnlyText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#FFFFFF" },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  sourceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sourceInfo: { flex: 1 },
  sourceName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  sourcePreview: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280" },
  moreText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
    marginVertical: 12,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingVertical: 17,
    marginTop: 4,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  scanBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
});
