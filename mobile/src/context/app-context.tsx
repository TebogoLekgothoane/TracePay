import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Language, AnalysisData, Subscription } from "@/types/navigation";
import { translations } from "@/hooks/use-language";
import { DEMO_USER_ID } from "@/lib/supabase";
// Auth commented out – always use demo user for data.
// import { getStoredUserId } from "@/lib/auth-storage";
import {
  fetchUserSettings,
  updateUserSettings,
  fetchFreezeSettings,
  updateFreezeSettings,
  fetchSubscriptions,
  toggleSubscriptionOptOut as apiToggleSubscriptionOptOut,
} from "@/lib/api";

const VALID_LANGUAGES: Language[] = ["en", "xh", "zu", "af", "st", "tn", "nso", "ts", "ve", "nr", "ss"];

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: keyof typeof translations.en) => string;
  analysisData: AnalysisData | null;
  setAnalysisData: (data: AnalysisData | null) => void;
  freezeSettings: FreezeSettings;
  setFreezeSettings: (settings: FreezeSettings) => void;
  isAnalysisComplete: boolean;
  setIsAnalysisComplete: (complete: boolean) => void;
  includeMomoData: boolean;
  setIncludeMomoData: (include: boolean) => void;
  subscriptions: Subscription[];
  toggleSubscriptionOptOut: (id: string) => void;
  airtimeLimit: number;
  setAirtimeLimitValue: (limit: number) => Promise<void>;
  userId: string;
  setUserId: (id: string | null) => void;
}

interface FreezeSettings {
  pauseDebitOrders: boolean;
  blockFeeAccounts: boolean;
  setAirtimeLimit: boolean;
  cancelSubscriptions: boolean;
}

const defaultFreezeSettings: FreezeSettings = {
  pauseDebitOrders: false,
  blockFeeAccounts: false,
  setAirtimeLimit: false,
  cancelSubscriptions: false,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

const LANGUAGE_KEY = "@tracepay_language";
const FREEZE_KEY = "@tracepay_freeze";
const MOMO_KEY = "@tracepay_momo";
const SUBSCRIPTIONS_KEY = "@tracepay_subscriptions";
const AIRTIME_LIMIT_KEY = "@tracepay_airtime_limit";

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [freezeSettings, setFreezeSettingsState] = useState<FreezeSettings>(defaultFreezeSettings);
  const [isAnalysisComplete, setIsAnalysisComplete] = useState(false);
  const [includeMomoData, setIncludeMomoDataState] = useState(true);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [airtimeLimit, setAirtimeLimitState] = useState<number>(300);
  const [userId, setUserIdState] = useState<string>(DEMO_USER_ID);

  // Auth commented out – always use demo user, never load stored userId
  // useEffect(() => {
  //   let cancelled = false;
  //   getStoredUserId().then((stored) => {
  //     if (!cancelled && stored) setUserIdState(stored);
  //   });
  //   return () => { cancelled = true; };
  // }, []);

  useEffect(() => {
    loadSettings();
  }, [userId]);

  const setUserId = (id: string | null) => {
    setUserIdState(id ?? DEMO_USER_ID);
  };

  const loadSettings = async () => {
    try {
      const effectiveUserId = userId;
      const [userSettings, freeze, subs] = await Promise.all([
        fetchUserSettings(effectiveUserId),
        fetchFreezeSettings(effectiveUserId),
        fetchSubscriptions(effectiveUserId),
      ]);

      // If logged-in user has no data in Supabase (e.g. new account), fall back to demo user
      // so the app still shows banks, rewards, subscriptions like before.
      const useDemoData =
        effectiveUserId !== DEMO_USER_ID &&
        (!userSettings || !freeze || !subs?.length);
      const [demoSettings, demoFreeze, demoSubs] = useDemoData
        ? await Promise.all([
            fetchUserSettings(DEMO_USER_ID),
            fetchFreezeSettings(DEMO_USER_ID),
            fetchSubscriptions(DEMO_USER_ID),
          ])
        : [null, null, null];

      const settings = userSettings ?? demoSettings;
      const freezeData = freeze ?? demoFreeze;
      const subsData = (subs?.length ? subs : demoSubs) ?? [];

      if (settings) {
        if (VALID_LANGUAGES.includes(settings.language as Language)) {
          setLanguageState(settings.language as Language);
        }
        setIncludeMomoDataState(settings.include_momo_data);
        setAirtimeLimitState(Number(settings.airtime_limit) || 300);
      } else {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (savedLanguage && VALID_LANGUAGES.includes(savedLanguage as Language)) {
          setLanguageState(savedLanguage as Language);
        }
        const savedMomo = await AsyncStorage.getItem(MOMO_KEY);
        if (savedMomo !== null) setIncludeMomoDataState(JSON.parse(savedMomo));
        const savedAirtimeLimit = await AsyncStorage.getItem(AIRTIME_LIMIT_KEY);
        if (savedAirtimeLimit) {
          const parsed = parseFloat(savedAirtimeLimit);
          if (!Number.isNaN(parsed) && parsed > 0) setAirtimeLimitState(parsed);
        }
      }

      if (freezeData) {
        setFreezeSettingsState({
          pauseDebitOrders: freezeData.pause_debit_orders,
          blockFeeAccounts: freezeData.block_fee_accounts,
          setAirtimeLimit: freezeData.set_airtime_limit,
          cancelSubscriptions: freezeData.cancel_subscriptions,
        });
      } else {
        const savedFreeze = await AsyncStorage.getItem(FREEZE_KEY);
        if (savedFreeze) setFreezeSettingsState(JSON.parse(savedFreeze));
      }

      if (subsData.length) {
        setSubscriptions(subsData);
      } else {
        const savedSubscriptions = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
        if (savedSubscriptions) setSubscriptions(JSON.parse(savedSubscriptions));
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      try {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (savedLanguage && VALID_LANGUAGES.includes(savedLanguage as Language)) {
          setLanguageState(savedLanguage as Language);
        }
        const savedFreeze = await AsyncStorage.getItem(FREEZE_KEY);
        if (savedFreeze) setFreezeSettingsState(JSON.parse(savedFreeze));
        const savedMomo = await AsyncStorage.getItem(MOMO_KEY);
        if (savedMomo !== null) setIncludeMomoDataState(JSON.parse(savedMomo));
        const savedSubscriptions = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
        if (savedSubscriptions) setSubscriptions(JSON.parse(savedSubscriptions));
        const savedAirtimeLimit = await AsyncStorage.getItem(AIRTIME_LIMIT_KEY);
        if (savedAirtimeLimit) {
          const parsed = parseFloat(savedAirtimeLimit);
          if (!Number.isNaN(parsed) && parsed > 0) setAirtimeLimitState(parsed);
        }
      } catch (e) {
        console.error("Error loading from AsyncStorage:", e);
      }
    }
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    try {
      const ok = await updateUserSettings(userId, { language: lang });
      if (!ok) await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    } catch (error) {
      console.error("Error saving language:", error);
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    }
  };

  const setFreezeSettings = async (settings: FreezeSettings) => {
    setFreezeSettingsState(settings);
    try {
      const ok = await updateFreezeSettings(userId, {
        pause_debit_orders: settings.pauseDebitOrders,
        block_fee_accounts: settings.blockFeeAccounts,
        set_airtime_limit: settings.setAirtimeLimit,
        cancel_subscriptions: settings.cancelSubscriptions,
      });
      if (!ok) await AsyncStorage.setItem(FREEZE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error("Error saving freeze settings:", error);
      await AsyncStorage.setItem(FREEZE_KEY, JSON.stringify(settings));
    }
  };

  const setIncludeMomoData = async (include: boolean) => {
    setIncludeMomoDataState(include);
    try {
      const ok = await updateUserSettings(userId, { include_momo_data: include });
      if (!ok) await AsyncStorage.setItem(MOMO_KEY, JSON.stringify(include));
    } catch (error) {
      console.error("Error saving momo setting:", error);
      await AsyncStorage.setItem(MOMO_KEY, JSON.stringify(include));
    }
  };

  const setAirtimeLimitValue = async (limit: number) => {
    const safe = Number.isNaN(limit) || limit <= 0 ? 0 : Math.round(limit);
    setAirtimeLimitState(safe);
    try {
      const ok = await updateUserSettings(userId, { airtime_limit: safe });
      if (!ok) await AsyncStorage.setItem(AIRTIME_LIMIT_KEY, String(safe));
    } catch (error) {
      console.error("Error saving airtime limit:", error);
      await AsyncStorage.setItem(AIRTIME_LIMIT_KEY, String(safe));
    }
  };

  const toggleSubscriptionOptOut = async (id: string) => {
    const updated = subscriptions.map((sub) =>
      sub.id === id ? { ...sub, isOptedOut: !sub.isOptedOut } : sub
    );
    setSubscriptions(updated);
    try {
      const ok = await apiToggleSubscriptionOptOut(userId, id);
      if (!ok) await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error("Error saving subscriptions:", error);
      await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(updated));
    }
  };

  const t = (key: keyof typeof translations.en): string => {
    const langTranslations =
      language === "en" || language === "xh" ? translations[language] : translations.en;
    return langTranslations[key] || translations.en[key] || key;
  };

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        t,
        analysisData,
        setAnalysisData,
        freezeSettings,
        setFreezeSettings,
        isAnalysisComplete,
        setIsAnalysisComplete,
        includeMomoData,
        setIncludeMomoData,
        subscriptions,
        toggleSubscriptionOptOut,
        airtimeLimit,
        setAirtimeLimitValue,
        userId,
        setUserId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

const defaultContextValue: AppContextType = {
  language: "en",
  setLanguage: async () => {},
  t: (key) => (translations.en[key] ?? key) as string,
  analysisData: null,
  setAnalysisData: () => {},
  freezeSettings: defaultFreezeSettings,
  setFreezeSettings: async () => {},
  isAnalysisComplete: false,
  setIsAnalysisComplete: () => {},
  includeMomoData: true,
  setIncludeMomoData: async () => {},
  subscriptions: [],
  toggleSubscriptionOptOut: async () => {},
  airtimeLimit: 300,
  setAirtimeLimitValue: async () => {},
  userId: DEMO_USER_ID,
  setUserId: () => {},
};

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    if (__DEV__) {
      console.warn("useApp was called outside AppProvider; using default context. Wrap your app root with <AppProvider>.");
    }
    return defaultContextValue;
  }
  return context;
}
