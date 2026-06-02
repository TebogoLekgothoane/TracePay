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
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useProfileStore } from "@/stores/profileStore";

const LANGUAGES = [
  { code: "English", label: "English", sub: "South African English", pop: "Most widely used" },
  { code: "isiZulu", label: "isiZulu", sub: "KwaZulu-Natal, Gauteng", pop: "~25% of SA" },
  { code: "isiXhosa", label: "isiXhosa", sub: "Eastern Cape, Western Cape", pop: "~19% of SA" },
  { code: "Afrikaans", label: "Afrikaans", sub: "Western Cape, Northern Cape", pop: "~13% of SA" },
  { code: "Sesotho", label: "Sesotho", sub: "Free State, Gauteng", pop: "~8% of SA" },
  { code: "Setswana", label: "Setswana", sub: "North West, Gauteng", pop: "~8% of SA" },
  { code: "Sepedi", label: "Sepedi", sub: "Limpopo, Mpumalanga", pop: "~9% of SA" },
  { code: "SiSwati", label: "SiSwati", sub: "Mpumalanga, Eswatini border", pop: "~3% of SA" },
  { code: "Xitsonga", label: "Xitsonga", sub: "Limpopo", pop: "~4% of SA" },
  { code: "Tshivenda", label: "Tshivenda", sub: "Limpopo", pop: "~2% of SA" },
  { code: "isiNdebele", label: "isiNdebele", sub: "Mpumalanga, Limpopo", pop: "~2% of SA" },
];

export default function LanguageScreen() {
  const { selectedLanguage, setSelectedLanguage } = useOnboardingStore();
  const setLanguage = useProfileStore((s) => s.setLanguage);

  const handleContinue = () => {
    setLanguage(selectedLanguage);
    router.push("/(onboarding)/features");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TracePayLogo />
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.step, i === 0 && styles.stepActive]} />
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepLabel}>STEP 1 OF 4</Text>
        <Text style={styles.title}>Choose your language</Text>
        <Text style={styles.subtitle}>
          TracePay supports all 11 official South African languages.
        </Text>

        <View style={styles.options}>
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => setSelectedLanguage(lang.code)}
                activeOpacity={0.7}
              >
                <Text style={styles.flag}>🇿🇦</Text>
                <View style={styles.langText}>
                  <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                    {lang.label}
                  </Text>
                  <Text style={styles.langSub}>{lang.sub} · {lang.pop}</Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btn} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={styles.btnText}>Continue</Text>
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

  scroll: { flex: 1 },
  body: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 16 },
  stepLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7C3AED", letterSpacing: 1.2, marginBottom: 10 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 10, lineHeight: 34 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 22, marginBottom: 24 },

  options: { gap: 10 },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  optionSelected: { borderColor: "#7C3AED", backgroundColor: "#FAFAFF" },
  flag: { fontSize: 22 },
  langText: { flex: 1 },
  langLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 2 },
  langLabelSelected: { color: "#7C3AED" },
  langSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#7C3AED" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#7C3AED" },

  footer: { paddingHorizontal: 24, paddingBottom: 32 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 17,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  btnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
});
