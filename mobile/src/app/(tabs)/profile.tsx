import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
} from "react-native";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProfileStore } from "@/stores/profileStore";
import { useVoice } from "@/hooks/useVoice";
import { useLeaksStore } from "@/stores/leaksStore";
import { router } from "expo-router";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const {
    name,
    email,
    language,
    voiceEnabled,
    setVoiceEnabled,
    connectedAccounts,
    signOut,
  } = useProfileStore();
  const { leaks } = useLeaksStore();
  const { speak } = useVoice();

  const totalLeaking = leaks
    .filter((l) => l.status === "active")
    .reduce((sum, l) => sum + l.amountMonthly, 0);

  const connectedList = [
    {
      id: "1",
      name: "Bank Account",
      sub: connectedAccounts.bank ? "Connected" : "Not connected",
      iconName: "bank-outline",
      iconBg: connectedAccounts.bank ? "#DCFCE7" : "#F3F4F6",
      iconColor: connectedAccounts.bank ? "#16A34A" : "#6B7280",
      connected: connectedAccounts.bank,
    },
    {
      id: "2",
      name: "Mobile Money",
      sub: connectedAccounts.mobile ? "MTN MoMo / Vodacom" : "Not connected",
      iconName: "cellphone",
      iconBg: connectedAccounts.mobile ? "#DCFCE7" : "#F3F4F6",
      iconColor: connectedAccounts.mobile ? "#16A34A" : "#6B7280",
      connected: connectedAccounts.mobile,
    },
    {
      id: "3",
      name: "SASSA Grant",
      sub: connectedAccounts.sassa ? "Connected" : "Not connected",
      iconName: "shield-outline",
      iconBg: connectedAccounts.sassa ? "#DCFCE7" : "#F3F4F6",
      iconColor: connectedAccounts.sassa ? "#16A34A" : "#6B7280",
      connected: connectedAccounts.sassa,
    },
  ];

  const handleVoiceToggle = (val: boolean) => {
    setVoiceEnabled(val);
    if (val) {
      setTimeout(
        () =>
          speak(
            `Voice narration enabled. You have ${leaks.filter((l) => l.status === "active").length} active money leaks totalling R${totalLeaking.toFixed(2)} per month.`
          ),
        300
      );
    }
  };

  const handleExportData = () => {
    Alert.alert(
      "Export Data",
      `Your data summary:\n• ${leaks.length} leaks\n• R${totalLeaking.toFixed(2)}/mo total leaking\n\nIn a production app, this would download a CSV file.`,
      [{ text: "OK" }]
    );
  };

  const doSignOut = async () => {
    await signOut();
    router.replace("/welcome");
  };

  const handleSignOut = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Clear all data and return to onboarding?")) {
        doSignOut();
      }
    } else {
      Alert.alert("Sign Out", "Clear all data and return to onboarding?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: doSignOut },
      ]);
    }
  };

  const menuItems = [
    { id: "lang", icon: "web", label: "Language", value: language, hasChevron: true, onPress: () => {} },
    { id: "privacy", icon: "lock-outline", label: "Privacy & Consent", value: "Active", hasChevron: true, onPress: () => {} },
    { id: "rescan", icon: "message-processing-outline", label: "Rescan SMS Inbox", value: "Run", hasChevron: true, onPress: () => router.push("/sms-scanning") },
    { id: "export", icon: "file-document-outline", label: "Export My Data", value: "CSV", hasChevron: true, onPress: handleExportData },
    { id: "help", icon: "help-circle-outline", label: "Help & Support", value: "", hasChevron: true, onPress: () => {} },
  ];

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
      <Text style={styles.title}>Profile</Text>

      <View style={styles.userCard}>
        <View style={styles.userAvatarBox}>
          <MaterialCommunityIcons name="account-outline" size={32} color="#7C3AED" />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{name}</Text>
          <Text style={styles.userIncome}>{email || "Email verified"}</Text>
          <View style={styles.popiaRow}>
            <View style={styles.popiaDot} />
            <Text style={styles.popiaText}>POPIA Compliant</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() =>
            speak(
              `Hello ${name.split(" ")[0]}. You have ${leaks.filter((l) => l.status === "active").length} active leaks.`
            )
          }
          style={styles.speakBtn}
        >
          <MaterialCommunityIcons name="volume-high" size={20} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      <View style={styles.voiceCard}>
        <View style={styles.voiceIcon}>
          <Ionicons name="volume-medium-outline" size={20} color="#7C3AED" />
        </View>
        <View style={styles.voiceInfo}>
          <Text style={styles.voiceTitle}>Voice Narration</Text>
          <Text style={styles.voiceSub}>Hear insights in {language}</Text>
        </View>
        <Switch
          value={voiceEnabled}
          onValueChange={handleVoiceToggle}
          trackColor={{ false: "#E5E7EB", true: "#7C3AED" }}
          thumbColor="#FFFFFF"
        />
      </View>

      {totalLeaking > 0 && (
        <View style={styles.leakSummaryCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#DC2626" />
          <Text style={styles.leakSummaryText}>
            {" "}<Text style={styles.leakSummaryBold}>R{totalLeaking.toFixed(2)}/month</Text> leaking from {leaks.filter((l) => l.status === "active").length} active leaks
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Connected Accounts</Text>

      <View style={styles.accountsCard}>
        {connectedList.map((acc, i) => (
          <View key={acc.id}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.accountRow}>
              <View style={[styles.accountIcon, { backgroundColor: acc.iconBg }]}>
                <MaterialCommunityIcons name={acc.iconName as any} size={20} color={acc.iconColor} />
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{acc.name}</Text>
                <Text style={styles.accountSub}>{acc.sub}</Text>
              </View>
              {acc.connected ? (
                <MaterialCommunityIcons name="check-circle-outline" size={22} color="#16A34A" />
              ) : (
                <TouchableOpacity style={styles.addBtn} activeOpacity={0.7}>
                  <Feather name="plus" size={16} color="#7C3AED" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.menuCard}>
        {menuItems.map((item, i) => (
          <View key={item.id}>
            {i > 0 && <View style={styles.divider} />}
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.7} onPress={item.onPress}>
              <MaterialCommunityIcons name={item.icon as any} size={20} color="#374151" style={styles.menuIcon} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <View style={styles.menuRight}>
                {item.value ? <Text style={styles.menuValue}>{item.value}</Text> : null}
                {item.hasChevron && <Feather name="chevron-right" size={16} color="#9CA3AF" />}
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.dataProtectedCard}>
        <View style={styles.dataProtectedHeader}>
          <MaterialCommunityIcons name="shield-lock-outline" size={18} color="#7C3AED" />
          <Text style={styles.dataProtectedTitle}> Your Data is Protected</Text>
        </View>
        <Text style={styles.dataProtectedDesc}>
          TracePay only accesses data you explicitly consent to share. Your information is encrypted and never shared with third parties. You can revoke access anytime.
        </Text>
      </View>

      <TouchableOpacity style={styles.signOutBtn} activeOpacity={0.7} onPress={handleSignOut}>
        <Feather name="log-out" size={16} color="#DC2626" />
        <Text style={styles.signOutText}> Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F6FB" },
  content: { paddingHorizontal: 18 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 20 },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  userAvatarBox: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 4 },
  userIncome: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", marginBottom: 6 },
  popiaRow: { flexDirection: "row", alignItems: "center" },
  popiaDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#16A34A", marginRight: 6 },
  popiaText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#16A34A" },
  speakBtn: { padding: 8 },
  voiceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  voiceIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  voiceInfo: { flex: 1 },
  voiceTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  voiceSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280" },
  leakSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  leakSummaryText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151", flex: 1 },
  leakSummaryBold: { fontFamily: "Inter_700Bold", color: "#DC2626" },
  sectionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 10 },
  accountsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accountRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  accountIcon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  accountSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280" },
  addBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  divider: { height: 1, backgroundColor: "#F3F4F6" },
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  menuIcon: { marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: "#111827" },
  menuRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  menuValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6B7280" },
  dataProtectedCard: {
    backgroundColor: "#EDE9FE",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  dataProtectedHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  dataProtectedTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#7C3AED" },
  dataProtectedDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 19 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  signOutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
});
