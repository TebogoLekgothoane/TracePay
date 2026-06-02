import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Switch,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TracePayLogo } from "@/components/TracePayLogo";
import { useState } from "react";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useProfileStore } from "@/stores/profileStore";

const BANKS = [
  { key: "capitec", name: "Capitec Bank", color: "#0085C7" },
  { key: "absa", name: "ABSA", color: "#DC2626" },
  { key: "fnb", name: "FNB", color: "#D97706" },
  { key: "standard", name: "Standard Bank", color: "#1C4F8C" },
  { key: "nedbank", name: "Nedbank", color: "#16A34A" },
];

const EXTRA_ACCOUNTS = [
  { key: "mobile" as const, title: "Mobile Money", desc: "MTN MoMo, Vodacom M-Pesa, Telkom" },
  { key: "sassa" as const, title: "SASSA / Government", desc: "Social grants, pension payments" },
];

export default function ConnectAccountsScreen() {
  const { connectedAccounts, toggleAccount } = useOnboardingStore();
  const { setConnectedAccounts, setConsentGiven } = useProfileStore();
  const onboardingData = useOnboardingStore();
  const [selectedBanks, setSelectedBanks] = useState<Set<string>>(new Set(["capitec"]));
  const [statementUploaded, setStatementUploaded] = useState(false);

  const toggleBank = (key: string) => {
    setSelectedBanks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  
  const handleContinue = () => {
    setConsentGiven(onboardingData.consentGiven);
    setConnectedAccounts({ ...connectedAccounts, bank: selectedBanks.size > 0 });
    router.push({
      pathname: "/sms-scanning",
      params: { fromOnboarding: "1" },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TracePayLogo />
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.step, i === 3 && styles.stepActive, i < 3 && styles.stepDone]} />
          ))}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>STEP 4 OF 4</Text>
        <Text style={styles.title}>Connect your accounts</Text>
        <Text style={styles.subtitle}>
          Select your bank and tell us how you want TracePay to scan for leaks.
        </Text>

        <Text style={styles.sectionTitle}>Your bank</Text>
        <View style={styles.bankGrid}>
          {BANKS.map((bank) => {
            const isSelected = selectedBanks.has(bank.key);
            return (
              <TouchableOpacity
                key={bank.key}
                style={[styles.bankChip, isSelected && { borderColor: bank.color, backgroundColor: bank.color + "12" }]}
                onPress={() => toggleBank(bank.key)}
                activeOpacity={0.7}
              >
                {isSelected && (
                  <View style={[styles.checkMark, { backgroundColor: bank.color }]}>
                    <MaterialCommunityIcons name="check" size={10} color="#fff" />
                  </View>
                )}
                <Text style={[styles.bankName, isSelected && { color: bank.color, fontFamily: "Inter_700Bold" }]}>
                  {bank.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Other accounts</Text>
        <View style={styles.extraList}>
          {EXTRA_ACCOUNTS.map((acc) => (
            <View key={acc.key} style={styles.extraRow}>
              <View style={styles.extraInfo}>
                <Text style={styles.extraTitle}>{acc.title}</Text>
                <Text style={styles.extraDesc}>{acc.desc}</Text>
              </View>
              <Switch
                value={connectedAccounts[acc.key]}
                onValueChange={() => toggleAccount(acc.key)}
                trackColor={{ false: "#E5E7EB", true: "#C4B5FD" }}
                thumbColor={connectedAccounts[acc.key] ? "#7C3AED" : "#9CA3AF"}
              />
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>How should TracePay scan?</Text>

        <View style={styles.sourceCard}>
          <View style={[styles.sourceIcon, { backgroundColor: "#EDE9FE" }]}>
            <MaterialCommunityIcons name="message-text-outline" size={20} color="#7C3AED" />
          </View>
          <View style={styles.sourceInfo}>
            <Text style={styles.sourceTitle}>SMS inbox scan</Text>
            <Text style={styles.sourceDesc}>Read bank & operator notifications · Most accurate · Always on</Text>
          </View>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>ON</Text>
          </View>
        </View>

          <View style={[styles.sourceIcon, { backgroundColor: statementUploaded ? "#DCFCE7" : "#F3F4F6" }]}>
            <MaterialCommunityIcons
              name={statementUploaded ? "file-check-outline" : "file-upload-outline"}
              size={20}
              color={statementUploaded ? "#16A34A" : "#6B7280"}
            />
          </View>

        <View style={styles.noteRow}>
          <MaterialCommunityIcons name="information-outline" size={14} color="#6B7280" />
          <Text style={styles.noteText}> You can update linked accounts anytime from your Profile.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={styles.btnText}>Scan My Inbox</Text>
          <MaterialCommunityIcons name="radar" size={20} color="#fff" />
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
  stepLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7C3AED", letterSpacing: 1.2, marginBottom: 10 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 10, lineHeight: 34 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 22, marginBottom: 28 },

  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 12, letterSpacing: 0.2 },
  bankGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 28 },
  bankChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  checkMark: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  bankName: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151" },

  extraList: {
    backgroundColor: "#FFFFFF", borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: "#F3F4F6",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    marginBottom: 28,
  },
  extraRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  extraInfo: { flex: 1 },
  extraTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  extraDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },

  sourceCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sourceCardDone: { borderColor: "#16A34A", backgroundColor: "#F0FDF4" },
  sourceIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sourceInfo: { flex: 1 },
  sourceTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  sourceDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },
  activeBadge: { backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#16A34A" },

  noteRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  noteText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", flex: 1, lineHeight: 18 },

  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 24, paddingBottom: 32, alignItems: "center" },
  backBtn: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: "#FFFFFF",
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
