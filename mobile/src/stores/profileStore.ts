import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { AuthError } from "@/lib/auth-errors";
import { AUTH_KEYS, clearAllTracePayStorage } from "@/lib/auth-storage";
import { useLeaksStore } from "@/stores/leaksStore";

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
  signUp: (email: string, password: string, phone?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  accountExistsForEmail: (email: string) => Promise<boolean>;
  resetPassword: (email: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  addRewardPoints: (pts: number) => void;
  completeOnboarding: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  syncToApi: () => Promise<void>;
}

const defaultConnectedAccounts = { bank: false, mobile: false, sassa: false };

export const useProfileStore = create<ProfileState>((set, get) => ({
  name: "",
  monthlyIncome: 0,
  language: "English",
  voiceEnabled: false,
  consentGiven: false,
  connectedAccounts: { ...defaultConnectedAccounts },
  onboardingComplete: false,
  isLoaded: false,
  isAuthenticated: false,
  email: "",
  phone: "",
  rewardPoints: 245,

  setName: (name) => {
    set({ name });
    AsyncStorage.setItem(AUTH_KEYS.name, name);
  },
  setMonthlyIncome: (income) => {
    set({ monthlyIncome: income });
    AsyncStorage.setItem(AUTH_KEYS.income, String(income));
  },
  setLanguage: (lang) => {
    set({ language: lang });
    AsyncStorage.setItem(AUTH_KEYS.language, lang);
  },
  setVoiceEnabled: (enabled) => {
    set({ voiceEnabled: enabled });
    AsyncStorage.setItem(AUTH_KEYS.voice, String(enabled));
    get().syncToApi();
  },
  setConsentGiven: (given) => {
    set({ consentGiven: given });
    AsyncStorage.setItem(AUTH_KEYS.consent, String(given));
  },
  setConnectedAccounts: (accounts) => {
    set({ connectedAccounts: accounts });
    AsyncStorage.setItem(AUTH_KEYS.accounts, JSON.stringify(accounts));
  },

  signUp: async (email, password, phone) => {
    const normalizedEmail = email.trim().toLowerCase();
    const storedEmail = (await AsyncStorage.getItem(AUTH_KEYS.email))?.toLowerCase();
    const hasAccount = (await AsyncStorage.getItem(AUTH_KEYS.isAuthenticated)) === "true";

    if (hasAccount && storedEmail === normalizedEmail) {
      throw new AuthError("An account with this email already exists. Sign in instead.");
    }

    if (hasAccount && storedEmail && storedEmail !== normalizedEmail) {
      await clearAllTracePayStorage();
      useLeaksStore.getState().resetLeaks();
    }

    await AsyncStorage.multiSet([
      [AUTH_KEYS.isAuthenticated, "true"],
      [AUTH_KEYS.email, normalizedEmail],
      [AUTH_KEYS.password, password],
      [AUTH_KEYS.onboardingComplete, "false"],
    ]);

    const updates: Partial<ProfileState> = {
      isAuthenticated: true,
      email: normalizedEmail,
      onboardingComplete: false,
      name: "",
      monthlyIncome: 0,
      consentGiven: false,
      connectedAccounts: { ...defaultConnectedAccounts },
      rewardPoints: 245,
    };

    if (phone) {
      updates.phone = phone;
      await AsyncStorage.setItem(AUTH_KEYS.phone, phone);
    } else {
      await AsyncStorage.removeItem(AUTH_KEYS.phone);
      updates.phone = "";
    }

    set(updates);
  },

  signIn: async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const [storedEmail, storedPassword, isAuth] = await Promise.all([
      AsyncStorage.getItem(AUTH_KEYS.email),
      AsyncStorage.getItem(AUTH_KEYS.password),
      AsyncStorage.getItem(AUTH_KEYS.isAuthenticated),
    ]);

    if (isAuth !== "true" || !storedEmail || !storedPassword) {
      throw new AuthError("No account found. Create an account first.");
    }

    if (storedEmail.toLowerCase() !== normalizedEmail || storedPassword !== password) {
      throw new AuthError("Incorrect email or password.");
    }

    await AsyncStorage.setItem(AUTH_KEYS.isAuthenticated, "true");
    set({ isAuthenticated: true, email: storedEmail.toLowerCase() });
    await get().loadFromStorage();
  },

  accountExistsForEmail: async (email) => {
    const normalizedEmail = email.trim().toLowerCase();
    const [storedEmail, isAuth] = await Promise.all([
      AsyncStorage.getItem(AUTH_KEYS.email),
      AsyncStorage.getItem(AUTH_KEYS.isAuthenticated),
    ]);

    return isAuth === "true" && storedEmail?.toLowerCase() === normalizedEmail;
  },

  resetPassword: async (email, newPassword) => {
    const normalizedEmail = email.trim().toLowerCase();
    const exists = await get().accountExistsForEmail(normalizedEmail);

    if (!exists) {
      throw new AuthError("No account found with this email.");
    }

    if (newPassword.length < 6) {
      throw new AuthError("Password must be at least 6 characters.");
    }

    await AsyncStorage.setItem(AUTH_KEYS.password, newPassword);
  },

  signOut: async () => {
    await clearAllTracePayStorage();
    useLeaksStore.getState().resetLeaks();
    set({
      name: "",
      monthlyIncome: 0,
      language: "English",
      voiceEnabled: false,
      consentGiven: false,
      connectedAccounts: { ...defaultConnectedAccounts },
      onboardingComplete: false,
      isAuthenticated: false,
      email: "",
      phone: "",
      rewardPoints: 0,
      isLoaded: true,
    });
  },

  addRewardPoints: (pts) => {
    const next = get().rewardPoints + pts;
    set({ rewardPoints: next });
    AsyncStorage.setItem(AUTH_KEYS.rewardPoints, String(next));
  },

  completeOnboarding: async () => {
    await AsyncStorage.setItem(AUTH_KEYS.onboardingComplete, "true");
    set({ onboardingComplete: true });
    await get().syncToApi();
  },

  loadFromStorage: async () => {
    const [complete, name, income, language, voice, consent, accounts, auth, email, phone, pts] =
      await Promise.all([
        AsyncStorage.getItem(AUTH_KEYS.onboardingComplete),
        AsyncStorage.getItem(AUTH_KEYS.name),
        AsyncStorage.getItem(AUTH_KEYS.income),
        AsyncStorage.getItem(AUTH_KEYS.language),
        AsyncStorage.getItem(AUTH_KEYS.voice),
        AsyncStorage.getItem(AUTH_KEYS.consent),
        AsyncStorage.getItem(AUTH_KEYS.accounts),
        AsyncStorage.getItem(AUTH_KEYS.isAuthenticated),
        AsyncStorage.getItem(AUTH_KEYS.email),
        AsyncStorage.getItem(AUTH_KEYS.phone),
        AsyncStorage.getItem(AUTH_KEYS.rewardPoints),
      ]);
    set({
      onboardingComplete: complete === "true",
      name: name ?? "",
      monthlyIncome: income ? parseInt(income, 10) : 0,
      language: language ?? "English",
      voiceEnabled: voice === "true",
      consentGiven: consent === "true",
      connectedAccounts: accounts
        ? JSON.parse(accounts)
        : { ...defaultConnectedAccounts },
      isAuthenticated: auth === "true",
      email: email ?? "",
      phone: phone ?? "",
      rewardPoints: pts ? parseInt(pts, 10) : 245,
      isLoaded: true,
    });
  },

  syncToApi: async () => {
    // Profile is stored locally only (simulated mode — no backend persistence).
  },
}));
