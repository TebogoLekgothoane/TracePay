import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@supabase/supabase-js";
import { create } from "zustand";

import { AuthError, mapSupabaseAuthError, PHONE_ALREADY_REGISTERED_MESSAGE } from "@/lib/auth-errors";
import { AUTH_KEYS, clearAllTracePayStorage } from "@/lib/auth-storage";
import { isValidSaPhone, normalizeSaPhone } from "@/lib/phone";
import { getSupabase } from "@/lib/supabase";
import { useLeaksStore } from "@/stores/leaksStore";
import { useDeviceAuthStore } from "@/stores/deviceAuthStore";

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
  recoveryEmail: string;
  rewardPoints: number;
  setName: (name: string) => void;
  setMonthlyIncome: (income: number) => void;
  setLanguage: (lang: string) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setConsentGiven: (given: boolean) => void;
  setConnectedAccounts: (accounts: Record<string, boolean>) => void;
  saveRecoveryEmail: (email: string) => Promise<void>;
  sendPhoneCode: (phone: string) => Promise<void>;
  verifyPhoneCode: (code: string) => Promise<void>;
  resendPhoneCode: () => Promise<void>;
  signUpWithPassword: (name: string, phone: string, password: string) => Promise<void>;
  verifySignUpOtp: (code: string) => Promise<void>;
  resendSignUpOtp: () => Promise<void>;
  signInWithPassword: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  addRewardPoints: (pts: number) => void;
  completeOnboarding: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  initializeAuth: () => Promise<() => void>;
}

const defaultConnectedAccounts = { bank: false, mobile: false, sassa: false };

let pendingPhoneAuth: { phone: string; mode: "login" | "signup"; name?: string } | null = null;

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

function applyUser(user: User | null): Partial<ProfileState> {
  return {
    isAuthenticated: Boolean(user),
    email: user?.email?.toLowerCase() ?? "",
    phone: user?.phone ?? "",
  };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function clearLocalProfileData() {
  await clearAllTracePayStorage();
  useLeaksStore.getState().resetLeaks();
}

async function persistPhone(phone: string) {
  if (phone) {
    await AsyncStorage.setItem(AUTH_KEYS.phone, phone);
  } else {
    await AsyncStorage.removeItem(AUTH_KEYS.phone);
  }
}

async function persistRecoveryEmail(email: string) {
  if (email) {
    await AsyncStorage.setItem(AUTH_KEYS.recoveryEmail, email);
  } else {
    await AsyncStorage.removeItem(AUTH_KEYS.recoveryEmail);
  }
}

async function fetchRecoveryEmail(userId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("recovery_email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Could not load recovery email from Supabase.", error);
    return "";
  }

  return typeof data?.recovery_email === "string" ? data.recovery_email : "";
}

async function ensureProfileRow(userId: string, fullName?: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.warn("Could not ensure Supabase profile row.", error);
  }
}

async function syncSessionUser(user: User | null) {
  if (!user) {
    return {
      isAuthenticated: false,
      email: "",
      phone: "",
      recoveryEmail: "",
    };
  }

  const nextPhone = user.phone ?? "";
  const recoveryEmail = await fetchRecoveryEmail(user.id);

  await AsyncStorage.setItem(AUTH_KEYS.userId, user.id);
  await persistPhone(nextPhone);
  await persistRecoveryEmail(recoveryEmail);

  return {
    ...applyUser(user),
    phone: nextPhone,
    recoveryEmail,
  };
}

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
  recoveryEmail: "",
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
  },
  setConsentGiven: (given) => {
    set({ consentGiven: given });
    AsyncStorage.setItem(AUTH_KEYS.consent, String(given));
  },
  setConnectedAccounts: (accounts) => {
    set({ connectedAccounts: accounts });
    AsyncStorage.setItem(AUTH_KEYS.accounts, JSON.stringify(accounts));
  },
  saveRecoveryEmail: async (email) => {
    if (!get().isAuthenticated) {
      throw new AuthError("Sign in before updating your recovery email.");
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      throw new AuthError("Enter a valid email address.");
    }

    const supabase = getSupabase();
    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser();

    if (sessionError || !user) {
      throw new AuthError("Sign in before updating your recovery email.");
    }

    try {
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          recovery_email: normalizedEmail || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        throw error;
      }

      await persistRecoveryEmail(normalizedEmail);
      set({ recoveryEmail: normalizedEmail });
    } catch (error) {
      throw mapSupabaseAuthError(error as { message?: string; code?: string });
    }
  },

  sendPhoneCode: async (phone) => {
    const normalizedPhone = normalizeSaPhone(phone);

    if (!isValidSaPhone(phone)) {
      throw new AuthError("Enter a valid SA mobile number (9 digits after +27).");
    }

    const supabase = getSupabase();

    try {
      await supabase.auth.signOut();
      await clearLocalProfileData();

      const { error } = await supabase.auth.signInWithOtp({ phone: normalizedPhone });
      if (error) {
        throw error;
      }

      pendingPhoneAuth = { phone: normalizedPhone, mode: "login" };
      set({
        isAuthenticated: false,
        email: "",
        phone: normalizedPhone,
        recoveryEmail: "",
        onboardingComplete: false,
      });
    } catch (error) {
      pendingPhoneAuth = null;
      throw mapSupabaseAuthError(error as { message?: string; code?: string });
    }
  },

  verifyPhoneCode: async (code) => {
    if (!pendingPhoneAuth) {
      throw new AuthError("Verification session expired. Please start again.");
    }

    const token = code.replace(/\s/g, "");
    if (token.length < 6) {
      throw new AuthError("Enter the 6-digit code from your SMS.");
    }

    const { phone } = pendingPhoneAuth;
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: "sms",
      });

      if (error) {
        throw error;
      }

      const user = data.user;
      if (!user) {
        throw new AuthError("Could not complete sign-in. Please try again.");
      }

      const onboardingComplete =
        (await AsyncStorage.getItem(AUTH_KEYS.onboardingComplete)) === "true";

      pendingPhoneAuth = null;

      await ensureProfileRow(user.id);
      await AsyncStorage.multiSet([
        [AUTH_KEYS.userId, user.id],
        [AUTH_KEYS.onboardingComplete, String(onboardingComplete)],
      ]);

      const sessionState = await syncSessionUser(user);

      set({
        ...sessionState,
        onboardingComplete,
      });
      await get().loadFromStorage();
    } catch (error) {
      throw mapSupabaseAuthError(error as { message?: string; code?: string });
    }
  },

  resendPhoneCode: async () => {
    if (!pendingPhoneAuth) {
      throw new AuthError("Verification session expired. Please start again.");
    }

    const supabase = getSupabase();

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: pendingPhoneAuth.phone,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      throw mapSupabaseAuthError(error as { message?: string; code?: string });
    }
  },

  signUpWithPassword: async (name, phone, password) => {
    const normalizedPhone = normalizeSaPhone(phone);
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new AuthError("Enter your full name.");
    }
    if (!isValidSaPhone(phone)) {
      throw new AuthError("Enter a valid SA mobile number (9 digits after +27).");
    }
    if (!isValidPassword(password)) {
      throw new AuthError("Password must be at least 8 characters.");
    }

    const supabase = getSupabase();

    try {
      const { data, error } = await supabase.auth.signUp({
        phone: normalizedPhone,
        password,
        options: {
          data: { full_name: trimmedName },
        },
      });

      if (error) {
        throw error;
      }

      if (data.user && data.user.identities?.length === 0) {
        throw new AuthError(PHONE_ALREADY_REGISTERED_MESSAGE);
      }

      pendingPhoneAuth = { phone: normalizedPhone, mode: "signup", name: trimmedName };
      get().setName(trimmedName);

      if (data.session?.user) {
        await ensureProfileRow(data.session.user.id, trimmedName);
        const sessionState = await syncSessionUser(data.session.user);
        set({ ...sessionState, onboardingComplete: false });
        pendingPhoneAuth = null;
        useDeviceAuthStore.getState().unlock();
      }
    } catch (error) {
      pendingPhoneAuth = null;
      throw mapSupabaseAuthError(error as { message?: string; code?: string });
    }
  },

  verifySignUpOtp: async (code) => {
    if (!pendingPhoneAuth || pendingPhoneAuth.mode !== "signup") {
      throw new AuthError("Verification session expired. Please start again.");
    }

    const token = code.replace(/\s/g, "");
    if (token.length < 6) {
      throw new AuthError("Enter the 6-digit code from your SMS.");
    }

    const { phone, name } = pendingPhoneAuth;
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: "sms",
      });

      if (error) {
        throw error;
      }

      const user = data.user;
      if (!user) {
        throw new AuthError("Could not complete sign-up. Please try again.");
      }

      pendingPhoneAuth = null;
      if (name) {
        get().setName(name);
      }

      await ensureProfileRow(user.id, name);
      await AsyncStorage.multiSet([
        [AUTH_KEYS.userId, user.id],
        [AUTH_KEYS.onboardingComplete, "false"],
      ]);

      const sessionState = await syncSessionUser(user);
      set({ ...sessionState, onboardingComplete: false });
      useDeviceAuthStore.getState().unlock();
      await get().loadFromStorage();
    } catch (error) {
      throw mapSupabaseAuthError(error as { message?: string; code?: string });
    }
  },

  resendSignUpOtp: async () => {
    if (!pendingPhoneAuth || pendingPhoneAuth.mode !== "signup") {
      throw new AuthError("Verification session expired. Please start again.");
    }

    const supabase = getSupabase();
    const { error } = await supabase.auth.resend({
      phone: pendingPhoneAuth.phone,
      type: "sms",
    });

    if (error) {
      throw mapSupabaseAuthError(error as { message?: string; code?: string });
    }
  },

  signInWithPassword: async (phone, password) => {
    const normalizedPhone = normalizeSaPhone(phone);

    if (!isValidSaPhone(phone)) {
      throw new AuthError("Enter a valid SA mobile number (9 digits after +27).");
    }
    if (!password) {
      throw new AuthError("Enter your password.");
    }

    const supabase = getSupabase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password,
      });

      if (error) {
        throw error;
      }

      const user = data.user;
      if (!user) {
        throw new AuthError("Could not sign in. Please try again.");
      }

      const onboardingComplete =
        (await AsyncStorage.getItem(AUTH_KEYS.onboardingComplete)) === "true";

      await ensureProfileRow(user.id);
      await AsyncStorage.setItem(AUTH_KEYS.userId, user.id);

      const sessionState = await syncSessionUser(user);
      set({ ...sessionState, onboardingComplete });
      useDeviceAuthStore.getState().unlock();
      await get().loadFromStorage();
    } catch (error) {
      throw mapSupabaseAuthError(error as { message?: string; code?: string });
    }
  },

  signOut: async () => {
    pendingPhoneAuth = null;
    await getSupabase().auth.signOut();
    await clearLocalProfileData();
    await useDeviceAuthStore.getState().clearDeviceAuth();
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
      recoveryEmail: "",
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
  },

  initializeAuth: async () => {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      const sessionState = await syncSessionUser(session.user);
      set(sessionState);
    } else {
      set(applyUser(null));
    }

    await get().loadFromStorage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (nextSession?.user) {
        const sessionState = await syncSessionUser(nextSession.user);
        set(sessionState);
        return;
      }

      pendingPhoneAuth = null;
      set({
        isAuthenticated: false,
        email: "",
        phone: "",
        recoveryEmail: "",
      });
    });

    return () => subscription.unsubscribe();
  },

  loadFromStorage: async () => {
    const [complete, name, income, language, voice, consent, accounts, phone, recoveryEmail, pts] =
      await Promise.all([
        AsyncStorage.getItem(AUTH_KEYS.onboardingComplete),
        AsyncStorage.getItem(AUTH_KEYS.name),
        AsyncStorage.getItem(AUTH_KEYS.income),
        AsyncStorage.getItem(AUTH_KEYS.language),
        AsyncStorage.getItem(AUTH_KEYS.voice),
        AsyncStorage.getItem(AUTH_KEYS.consent),
        AsyncStorage.getItem(AUTH_KEYS.accounts),
        AsyncStorage.getItem(AUTH_KEYS.phone),
        AsyncStorage.getItem(AUTH_KEYS.recoveryEmail),
        AsyncStorage.getItem(AUTH_KEYS.rewardPoints),
      ]);

    let sessionEmail = "";
    let sessionPhone = phone || "";
    let sessionRecoveryEmail = recoveryEmail || "";
    let isAuthenticated = get().isAuthenticated;

    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const sessionState = applyUser(user);
      isAuthenticated = sessionState.isAuthenticated ?? false;
      sessionEmail = sessionState.email ?? "";
      sessionPhone = sessionState.phone || phone || "";
      sessionRecoveryEmail = await fetchRecoveryEmail(user.id);
      await AsyncStorage.setItem(AUTH_KEYS.userId, user.id);
      await persistPhone(sessionPhone);
      await persistRecoveryEmail(sessionRecoveryEmail);
    }

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
      isAuthenticated,
      email: sessionEmail,
      phone: sessionPhone || phone || "",
      recoveryEmail: sessionRecoveryEmail,
      rewardPoints: pts ? parseInt(pts, 10) : 245,
      isLoaded: true,
    });
  },
}));
