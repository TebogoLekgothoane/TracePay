import { NavigatorScreenParams } from "@react-navigation/native";

export type MainTabParamList = {
  Dashboard: undefined;
  Freeze: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  LanguageSelection: undefined;
  Consent: undefined;
  AnalysisLoading: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  LossDetail: {
    category: string;
    amount: number;
    percentage: number;
    severity: "critical" | "warning" | "info";
    transactions: Transaction[];
  };
  VoiceModal: undefined;
  FreezeControl: undefined;
};

export type Transaction = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
};

export type LossCategory = {
  id: string;
  name: string;
  nameXhosa: string;
  amount: number;
  percentage: number;
  severity: "critical" | "warning" | "info";
  transactions: Transaction[];
};

export type Language = 
  | "en"   // English
  | "xh"   // IsiXhosa
  | "zu"   // IsiZulu
  | "af"   // Afrikaans
  | "st"   // Sesotho
  | "tn"   // Setswana
  | "nso"  // Sepedi
  | "ts"   // Xitsonga
  | "ve"   // Tshivenda
  | "nr"   // IsiNdebele
  | "ss";  // SiSwati

export type MoMoData = {
  totalSpent: number;
  alternativeCost: number;
  potentialSavings: number;
  breakdown: {
    airtime: { momoSpent: number; alternativeCost: number };
    data: { momoSpent: number; alternativeCost: number };
  };
};

export type AnalysisData = {
  totalLoss: number;
  monthlyIncome: number;
  categories: LossCategory[];
  momoData?: MoMoData;
  summary: {
    en: string;
    xh: string;
  };
};

export type Subscription = {
  id: string;
  name: string;
  amount: number;
  isOptedOut: boolean;
};
