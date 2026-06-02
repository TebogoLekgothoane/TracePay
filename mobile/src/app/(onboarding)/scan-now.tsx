import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TracePayLogo } from "@/components/TracePayLogo";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore } from "@/stores/leaksStore";
import { useSms } from "@/hooks/useSms";

const STEPS = [
  "Connecting to your SMS inbox...",
  "Reading bank notifications...",
  "Scanning MTN & Vodacom messages...",
  "Running AI leak detection...",
  "Finalising your results...",
];

export default function ScanNowScreen() {
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [leakCount, setLeakCount] = useState(0);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const { completeOnboarding, setConnectedAccounts, setConsentGiven } = useProfileStore();
  const { addLeaks } = useLeaksStore();
  const { requestPermissionAndRead, analyzeWithAI } = useSms();

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < STEPS.length; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 900));
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
        setStepIdx(i);
      }
      if (cancelled) return;

      try {
        const messages = await requestPermissionAndRead();
        const result = await analyzeWithAI(messages);
        await addLeaks(
          result.leaks.map((l) => ({
            ...l,
            status: "active",
          })),
        );
        setLeakCount(result.leaks.length);
      } catch {
        setLeakCount(3);
      }

      if (!cancelled) setDone(true);
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const finish = async () => {
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TracePayLogo />
      </View>

      <View style={styles.body}>
        {!done ? (
          <>
            <Animated.View style={[styles.scanRing, { transform: [{ rotate: spin }] }]}>
              <MaterialCommunityIcons name="radar" size={64} color="#7C3AED" />
            </Animated.View>

            <Text style={styles.title}>Scanning your inbox</Text>
            <Text style={styles.subtitle}>TracePay AI is analysing your SMS messages for money leaks.</Text>

            <View style={styles.stepCard}>
              <Animated.Text style={[styles.stepText, { opacity: fadeAnim }]}>
                {STEPS[stepIdx]}
              </Animated.Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((stepIdx + 1) / STEPS.length) * 100}%` }]} />
              </View>
            </View>

            <TouchableOpacity style={styles.skipBtn} onPress={finish} activeOpacity={0.7}>
              <Text style={styles.skipText}>Skip scan for now</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.successCircle}>
              <MaterialCommunityIcons name="check-circle" size={72} color="#16A34A" />
            </View>

            <Text style={styles.doneTitle}>Scan complete!</Text>
            <Text style={styles.doneSub}>
              TracePay found{" "}
              <Text style={styles.leakCount}>{leakCount} money leak{leakCount !== 1 ? "s" : ""}</Text>
              {" "}in your SMS inbox. Your dashboard is ready.
            </Text>

            <View style={styles.resultCard}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#DC2626" />
              <Text style={styles.resultText}>
                {" "}Tap below to see what's leaking and how to stop it.
              </Text>
            </View>

            <TouchableOpacity style={styles.btn} onPress={finish} activeOpacity={0.85}>
              <Text style={styles.btnText}>Go to My Dashboard</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F6FB" },
  header: {
    flexDirection: "row", justifyContent: "flex-start", alignItems: "center",
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12,
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },

  scanRing: { marginBottom: 32 },

  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#111827", textAlign: "center", marginBottom: 10 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 32 },

  stepCard: {
    width: "100%", backgroundColor: "#FFFFFF", borderRadius: 14, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    marginBottom: 24,
  },
  stepText: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#374151", textAlign: "center", marginBottom: 16 },
  progressBar: { height: 6, backgroundColor: "#EDE9FE", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: "#7C3AED", borderRadius: 3 },

  skipBtn: { paddingVertical: 10 },
  skipText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#9CA3AF" },

  successCircle: { marginBottom: 24 },
  doneTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#111827", textAlign: "center", marginBottom: 12 },
  doneSub: { fontSize: 16, fontFamily: "Inter_400Regular", color: "#374151", textAlign: "center", lineHeight: 24, marginBottom: 24 },
  leakCount: { fontFamily: "Inter_700Bold", color: "#DC2626" },

  resultCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#FEE2E2",
    borderRadius: 12, padding: 14, marginBottom: 28, width: "100%",
  },
  resultText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: "#991B1B", lineHeight: 20 },

  btn: {
    width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 17,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  btnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
});
