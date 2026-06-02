import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TracePayLogo } from "@/components/TracePayLogo";
import { useProfileStore } from "@/stores/profileStore";

export default function WelcomeScreen() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setAuthenticated } = useProfileStore();

  const normalizedEmail = email.trim().toLowerCase();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const isValidPassword = password.length >= 6;
  const isValidPhone = phone.replace(/\s/g, "").length >= 9;
  const isValid = isValidEmail && isValidPassword && (mode === "signin" || isValidPhone);

  const handleSubmit = async () => {
    if (!isValid) return;
    setError("");
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\s/g, "").startsWith("0")
        ? "+27" + phone.replace(/\s/g, "").slice(1)
        : phone.replace(/\s/g, "");
      await setAuthenticated(normalizedEmail, password, mode === "signup" ? cleanPhone : undefined);
      router.replace("/(onboarding)/language");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <View style={styles.logoArea}>
            <TracePayLogo size={96} layout="column" />
            <Text style={styles.logoTagline}>Your money guardian</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.toggle}>
              <TouchableOpacity
                style={[styles.toggleBtn, mode === "signup" && styles.toggleBtnActive]}
                onPress={() => { setMode("signup"); setError(""); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleText, mode === "signup" && styles.toggleTextActive]}>Create Account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, mode === "signin" && styles.toggleBtnActive]}
                onPress={() => { setMode("signin"); setError(""); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleText, mode === "signin" && styles.toggleTextActive]}>Sign In</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardTitle}>
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </Text>
            <Text style={styles.cardSub}>
              {mode === "signup"
                ? "Use your email, password and phone number to create your TracePay account."
                : "Use your email and password to sign back in."}
            </Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email address</Text>
              <View style={styles.inputWrap}>
                <MaterialCommunityIcons name="email-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.inputWrap}>
                <MaterialCommunityIcons name="lock-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  returnKeyType={mode === "signup" ? "next" : "done"}
                  onSubmitEditing={mode === "signin" ? handleSubmit : undefined}
                />
              </View>
            </View>

            {mode === "signup" && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>SA phone number</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.prefix}>+27</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="72 123 4567"
                    placeholderTextColor="#9CA3AF"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                </View>
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.btn, !isValid && styles.btnDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={loading || !isValid}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.btnText}>
                    {mode === "signup" ? "Create Account" : "Sign In"}
                  </Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.trustRow}>
            <MaterialCommunityIcons name="shield-lock-outline" size={13} color="#9CA3AF" />
            <Text style={styles.trustText}> POPIA compliant · Prototype auth stored locally</Text>
          </View>

          <View style={styles.features}>
            {[
              { icon: "magnify-scan", text: "Detect hidden money leaks from your SMS inbox" },
              { icon: "brain", text: "AI budget coach built for South Africa" },
              { icon: "tag-heart-outline", text: "Earn retail discounts by stopping leaks" },
            ].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <MaterialCommunityIcons name={f.icon as any} size={16} color="#7C3AED" />
                </View>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F6FB" },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 40 },

  logoArea: { alignItems: "center", marginBottom: 32, gap: 8 },
  logoTagline: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6B7280", marginTop: 4 },

  card: {
    backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24, marginBottom: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  toggle: {
    flexDirection: "row", backgroundColor: "#F3F4F6", borderRadius: 10,
    padding: 4, marginBottom: 24,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  toggleBtnActive: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  toggleText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#6B7280" },
  toggleTextActive: { color: "#111827", fontFamily: "Inter_600SemiBold" },

  cardTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 6 },
  cardSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 20, marginBottom: 24 },

  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 8 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#F9FAFB", borderRadius: 12,
    borderWidth: 1.5, borderColor: "#E5E7EB",
    paddingHorizontal: 14, paddingVertical: 14,
  },
  prefix: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#374151" },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: "#111827" },

  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#DC2626", marginBottom: 12 },

  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 17, marginTop: 4,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF" },

  trustRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  trustText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF" },

  features: { gap: 14 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  featureText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 20 },
});
