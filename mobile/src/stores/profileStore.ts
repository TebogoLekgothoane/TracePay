import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface ProfileState {
  name: string;
  monthlyIncome: number;
  language: string;
  voiceEnabled: boolean;
  consentGiven: boolean;
  connectedAccounts: Record<string, boolean>;
  onboardingComplete: boolean;
  isLoaded: boolean;
  isAuthenticated: boolean;
  email: string;
  phone: string;
  rewardPoints: number;
  setName: (name: string) => void;
  setMonthlyIncome: (income: number) => void;
  setLanguage: (lang: string) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setConsentGiven: (given: boolean) => void;
  setConnectedAccounts: (accounts: Record<string, boolean>) => void;
  setAuthenticated: (email: string, password: string, phone?: string) => Promise<void>;
  addRewardPoints: (pts: number) => void;
  completeOnboarding: () => Promise<void>;
  resetProfile: () => void;
  loadFromStorage: () => Promise<void>;
  syncToApi: () => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  name: "",
  monthlyIncome: 0,
  language: "English",
  voiceEnabled: false,
  consentGiven: false,
  connectedAccounts: { bank: false, mobile: false, sassa: false },
  onboardingComplete: false,
  isLoaded: false,
  isAuthenticated: false,
  email: "",
  phone: "",
  rewardPoints: 245,

  setName: (name) => {
    set({ name });
    AsyncStorage.setItem("@tracepay:name", name);
  },
  setMonthlyIncome: (income) => {
    set({ monthlyIncome: income });
    AsyncStorage.setItem("@tracepay:income", String(income));
  },
  setLanguage: (lang) => {
    set({ language: lang });
    AsyncStorage.setItem("@tracepay:language", lang);
  },
  setVoiceEnabled: (enabled) => {
    set({ voiceEnabled: enabled });
    AsyncStorage.setItem("@tracepay:voice", String(enabled));
    get().syncToApi();
  },
  setConsentGiven: (given) => {
    set({ consentGiven: given });
    AsyncStorage.setItem("@tracepay:consent", String(given));
  },
  setConnectedAccounts: (accounts) => {
    set({ connectedAccounts: accounts });
    AsyncStorage.setItem("@tracepay:accounts", JSON.stringify(accounts));
  },

  setAuthenticated: async (email, password, phone) => {
    await AsyncStorage.setItem("@tracepay:isAuthenticated", "true");
    await AsyncStorage.setItem("@tracepay:email", email);
    await AsyncStorage.setItem("@tracepay:password", password);
    const updates: Partial<ProfileState> = { isAuthenticated: true, email };
    if (phone) {
      updates.phone = phone;
      await AsyncStorage.setItem("@tracepay:phone", phone);
    }
    set(updates);
  },

  addRewardPoints: (pts) => {
    const next = get().rewardPoints + pts;
    set({ rewardPoints: next });
    AsyncStorage.setItem("@tracepay:rewardPoints", String(next));
  },

  completeOnboarding: async () => {
    await AsyncStorage.setItem("@tracepay:onboardingComplete", "true");
    set({ onboardingComplete: true });
    await get().syncToApi();
  },

  resetProfile: () => {
    set({
      name: "",
      monthlyIncome: 0,
      language: "English",
      voiceEnabled: false,
      consentGiven: false,
      connectedAccounts: { bank: false, mobile: false, sassa: false },
      onboardingComplete: false,
      isAuthenticated: false,
      email: "",
      phone: "",
      rewardPoints: 0,
    });
  },

  loadFromStorage: async () => {
    const [complete, name, income, language, voice, consent, accounts, auth, email, phone, pts] =
      await Promise.all([
        AsyncStorage.getItem("@tracepay:onboardingComplete"),
        AsyncStorage.getItem("@tracepay:name"),
        AsyncStorage.getItem("@tracepay:income"),
        AsyncStorage.getItem("@tracepay:language"),
        AsyncStorage.getItem("@tracepay:voice"),
        AsyncStorage.getItem("@tracepay:consent"),
        AsyncStorage.getItem("@tracepay:accounts"),
        AsyncStorage.getItem("@tracepay:isAuthenticated"),
        AsyncStorage.getItem("@tracepay:email"),
        AsyncStorage.getItem("@tracepay:phone"),
        AsyncStorage.getItem("@tracepay:rewardPoints"),
      ]);
    set({
      onboardingComplete: complete === "true",
      name: name ?? "",
      monthlyIncome: income ? parseInt(income) : 0,
      language: language ?? "English",
      voiceEnabled: voice === "true",
      consentGiven: consent === "true",
      connectedAccounts: accounts ? JSON.parse(accounts) : { bank: false, mobile: false, sassa: false },
      isAuthenticated: auth === "true",
      email: email ?? "",
      phone: phone ?? "",
      rewardPoints: pts ? parseInt(pts) : 245,
      isLoaded: true,
    });
  },

  syncToApi: async () => {
    // Profile is stored locally only (simulated mode — no backend persistence).
  },
}));
