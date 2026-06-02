import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSms } from "@/hooks/useSms";

export default function SmsScanningScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === "1";
  const { requestPermissionAndRead, analyzeWithAI } = useSms();

  const [phase, setPhase] = useState<"preparing" | "reading" | "analysing" | "done">("preparing");
  const [messages, setMessages] = useState<{ address: string; body: string; date: number }[]>([]);
  const [leaksFound, setLeaksFound] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<{ leaks: any[]; totalMonthly: number } | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const animateTo = useCallback(
    (toValue: number, duration: number) =>
      new Promise<void>((resolve) => {
        Animated.timing(progressAnim, {
          toValue,
          duration,
          useNativeDriver: false,
        }).start(() => resolve());
      }),
    [progressAnim],
  );

  const runScan = useCallback(async () => {
    setPhase("preparing");
    await animateTo(0.15, 400);

    const smsMessages = await requestPermissionAndRead();
    setMessages(smsMessages);
    setPhase("reading");
    await animateTo(0.45, 700);

    setPhase("analysing");
    await animateTo(0.75, 800);

    const result = await analyzeWithAI(smsMessages);
    setAnalysisResult(result);
    setLeaksFound(result.leaks.length);
    setPhase("done");
    await animateTo(1.0, 500);
  }, [analyzeWithAI, requestPermissionAndRead, animateTo]);

  useEffect(() => {
    runScan();
  }, [runScan]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const phaseLabels = {
    preparing: "Loading demo bank SMS messages...",
    reading: `Reading ${messages.length || 4} messages...`,
    analysing: "Scanning for money leaks...",
    done: `Analysis complete — ${leaksFound || 3} leaks found`,
  };

  const displayMessages = messages.slice(0, 6);

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
          <View style={styles.headerText}>
            <Text style={styles.title}>Scanning SMS Inbox</Text>
            <Text style={styles.subtitle}>{phaseLabels[phase]}</Text>
          </View>
          {leaksFound > 0 && (
            <View style={styles.leaksBadge}>
              <Feather name="alert-triangle" size={13} color="#DC2626" />
              <Text style={styles.leaksBadgeText}> {leaksFound} leaks</Text>
            </View>
          )}
        </View>

        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        <View style={styles.analysingRow}>
          {phase !== "done" ? (
            <>
              <ActivityIndicator size="small" color="#7C3AED" />
              <Text style={styles.analysingText}>{phaseLabels[phase]}</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color="#16A34A" />
              <Text style={[styles.analysingText, { color: "#16A34A" }]}>
                Found 3 money leaks in {messages.length} messages
              </Text>
            </>
          )}
        </View>

        {displayMessages.map((msg, i) => {
          const body = msg.body.toLowerCase();
          const leakHint = analysisResult?.leaks.find((l) => {
            const n = l.name.toLowerCase();
            if (n.includes("iflix") && body.includes("iflix")) return true;
            if (n.includes("loan") && body.includes("loan")) return true;
            if (n.includes("advance") && body.includes("advance")) return true;
            return false;
          });
          const isLeak = !!leakHint;
          return (
            <View key={i} style={[styles.msgCard, isLeak && styles.msgCardLeak]}>
              <View style={styles.msgHeader}>
                <View style={[styles.msgIcon, isLeak ? styles.msgIconLeak : styles.msgIconNormal]}>
                  <MaterialCommunityIcons
                    name="message-text-outline"
                    size={16}
                    color={isLeak ? "#DC2626" : "#7C3AED"}
                  />
                </View>
                <Text style={styles.msgSender}>{msg.address}</Text>
                <Text style={styles.msgTime}>
                  {new Date(msg.date).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              <Text style={styles.msgText} numberOfLines={3}>
                {msg.body}
              </Text>
              {isLeak && leakHint && (
                <View style={styles.leakLabel}>
                  <Feather name="alert-triangle" size={12} color="#DC2626" />
                  <Text style={styles.leakLabelText}>
                    {" "}Leak detected: {leakHint.category} — R{leakHint.amountMonthly}/mo
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        {phase === "done" && analysisResult && (
          <TouchableOpacity
            style={styles.resultsBtn}
            activeOpacity={0.85}
            onPress={() => {
              const encoded = encodeURIComponent(JSON.stringify(analysisResult));
              router.push({
                pathname: "/sms-results",
                params: {
                  data: encoded,
                  ...(fromOnboarding ? { fromOnboarding: "1" } : {}),
                },
              });
            }}
          >
            <MaterialCommunityIcons name="chart-box-outline" size={18} color="#fff" />
            <Text style={styles.resultsBtnText}>  View Results →</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F6FB" },
  content: { paddingHorizontal: 18 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  backBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  headerText: { flex: 1, minWidth: 140 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 2 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280" },
  leaksBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, alignSelf: "flex-start",
  },
  leaksBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
  progressBar: { height: 6, backgroundColor: "#E5E7EB", borderRadius: 3, marginBottom: 14, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#7C3AED", borderRadius: 3 },
  analysingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  analysingText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151" },
  msgCard: {
    backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  msgCardLeak: { backgroundColor: "#FFF5F5", borderWidth: 1, borderColor: "#FECACA" },
  msgHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  msgIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 8 },
  msgIconLeak: { backgroundColor: "#FEE2E2" },
  msgIconNormal: { backgroundColor: "#EDE9FE" },
  msgSender: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827" },
  msgTime: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280" },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 20, marginBottom: 8 },
  leakLabel: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "#FEE2E2", borderRadius: 8, padding: 8,
  },
  leakLabelText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#DC2626", flex: 1, flexWrap: "wrap" },
  resultsBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 16, marginTop: 8,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  retryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#DC2626", borderRadius: 14, paddingVertical: 16, marginTop: 8,
  },
  resultsBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
});

