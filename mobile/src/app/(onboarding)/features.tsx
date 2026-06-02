import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TracePayLogo } from "@/components/TracePayLogo";

const FEATURES = [
  {
    icon: "magnify-scan" as const,
    color: "#DC2626",
    bg: "#FEE2E2",
    title: "Detect Money Leaks",
    desc: "Scans your bank and mobile SMS inbox to surface hidden fees, forgotten subscriptions and airtime advances.",
  },
  {
    icon: "brain" as const,
    color: "#7C3AED",
    bg: "#EDE9FE",
    title: "AI Budget Coach",
    desc: "Generates a weekly budget from spending patterns, upcoming payments and active leaks.",
  },
  {
    icon: "chart-line" as const,
    color: "#2563EB",
    bg: "#DBEAFE",
    title: "Spending History",
    desc: "Every transaction grouped by date so you can see exactly where your money goes each month.",
  },
  {
    icon: "snowflake" as const,
    color: "#16A34A",
    bg: "#DCFCE7",
    title: "Stop Leaks Instantly",
    desc: "Flag a money leak and get a specific step-by-step action to stop it — no guesswork.",
  },
];

export default function FeaturesScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TracePayLogo />
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.step, i === 1 && styles.stepActive, i < 1 && styles.stepDone]} />
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepLabel}>STEP 2 OF 4</Text>
        <Text style={styles.title}>What TracePay does</Text>
        <Text style={styles.subtitle}>
          An AI-powered money guardian built for South Africans.
        </Text>

        <View style={styles.featureList}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={[styles.iconBox, { backgroundColor: f.bg }]}>
                <MaterialCommunityIcons name={f.icon} size={22} color={f.color} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.trustRow}>
          <MaterialCommunityIcons name="shield-lock-outline" size={14} color="#6B7280" />
          <Text style={styles.trustText}> No data sold · SMS read-only · POPIA compliant</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.push("/(onboarding)/consent" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Sounds good</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F6FB" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12,
  },
  stepRow: { flexDirection: "row", gap: 5 },
  step: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E5E7EB" },
  stepActive: { width: 24, backgroundColor: "#7C3AED" },
  stepDone: { backgroundColor: "#C4B5FD" },

  scroll: { flex: 1 },
  body: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 16 },
  stepLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7C3AED",
    letterSpacing: 1.2, marginBottom: 10,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 10, lineHeight: 34 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 22, marginBottom: 28 },

  featureList: { gap: 12, marginBottom: 24 },
  featureCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: "#F3F4F6",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  iconBox: { width: 44, height: 44, borderRadius: 11, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  featureText: { flex: 1, paddingTop: 2 },
  featureTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 4 },
  featureDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 19 },

  trustRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  trustText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF" },

  footer: {
    flexDirection: "row", gap: 12, paddingHorizontal: 24, paddingBottom: 32, alignItems: "center",
  },
  backBtn: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: "#FFFFFF",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 17,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  btnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
});
