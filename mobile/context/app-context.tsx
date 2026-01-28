import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Language, AnalysisData, Subscription } from "@/types/navigation";
import { translations } from "@/hooks/use-language";

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

const defaultSubscriptions: Subscription[] = [
  { id: "netflix", name: "Netflix SA", amount: 159, isOptedOut: false },
  { id: "showmax", name: "Showmax", amount: 99, isOptedOut: false },
  { id: "spotify", name: "Spotify", amount: 59.99, isOptedOut: false },
  { id: "dstv", name: "DSTV Now", amount: 29, isOptedOut: false },
  { id: "youtube", name: "YouTube Premium", amount: 71.99, isOptedOut: false },
];

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
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(defaultSubscriptions);
  const [airtimeLimit, setAirtimeLimitState] = useState<number>(300);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (savedLanguage && VALID_LANGUAGES.includes(savedLanguage as Language)) {
        setLanguageState(savedLanguage as Language);
      }
      const savedFreeze = await AsyncStorage.getItem(FREEZE_KEY);
      if (savedFreeze) {
        setFreezeSettingsState(JSON.parse(savedFreeze));
      }
      const savedMomo = await AsyncStorage.getItem(MOMO_KEY);
      if (savedMomo !== null) {
        setIncludeMomoDataState(JSON.parse(savedMomo));
      }
      const savedSubscriptions = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
      if (savedSubscriptions) {
        setSubscriptions(JSON.parse(savedSubscriptions));
      }
      const savedAirtimeLimit = await AsyncStorage.getItem(AIRTIME_LIMIT_KEY);
      if (savedAirtimeLimit) {
        const parsed = parseFloat(savedAirtimeLimit);
        if (!Number.isNaN(parsed) && parsed > 0) {
          setAirtimeLimitState(parsed);
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
      setLanguageState(lang);
    } catch (error) {
      console.error("Error saving language:", error);
    }
  };

  const setFreezeSettings = async (settings: FreezeSettings) => {
    try {
      await AsyncStorage.setItem(FREEZE_KEY, JSON.stringify(settings));
      setFreezeSettingsState(settings);
    } catch (error) {
      console.error("Error saving freeze settings:", error);
    }
  };

  const setIncludeMomoData = async (include: boolean) => {
    try {
      await AsyncStorage.setItem(MOMO_KEY, JSON.stringify(include));
      setIncludeMomoDataState(include);
    } catch (error) {
      console.error("Error saving momo setting:", error);
    }
  };

  const setAirtimeLimitValue = async (limit: number) => {
    try {
      const safe = Number.isNaN(limit) || limit <= 0 ? 0 : Math.round(limit);
      await AsyncStorage.setItem(AIRTIME_LIMIT_KEY, String(safe));
      setAirtimeLimitState(safe);
    } catch (error) {
      console.error("Error saving airtime limit:", error);
    }
  };

  const toggleSubscriptionOptOut = async (id: string) => {
    const updated = subscriptions.map((sub) =>
      sub.id === id ? { ...sub, isOptedOut: !sub.isOptedOut } : sub
    );
    setSubscriptions(updated);
    try {
      await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error("Error saving subscriptions:", error);
    }
  };

  const t = (key: keyof typeof translations.en): string => {
    // Fallback to English if translation doesn't exist for the selected language
    const langTranslations = language === "en" || language === "xh" 
      ? translations[language] 
      : translations.en;
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
