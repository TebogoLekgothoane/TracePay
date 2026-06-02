import { create } from "zustand";

interface OnboardingState {
  selectedLanguage: string;
  name: string;
  monthlyIncome: string;
  consentGiven: boolean;
  includeMomoData: boolean;
  connectedAccounts: { bank: boolean; mobile: boolean; sassa: boolean };
  setSelectedLanguage: (lang: string) => void;
  setName: (name: string) => void;
  setMonthlyIncome: (income: string) => void;
  setConsentGiven: (given: boolean) => void;
  setIncludeMomoData: (value: boolean) => void;
  toggleAccount: (key: "bank" | "mobile" | "sassa") => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  selectedLanguage: "English",
  name: "",
  monthlyIncome: "",
  consentGiven: false,
  includeMomoData: true,
  connectedAccounts: { bank: false, mobile: false, sassa: false },
  setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),
  setName: (name) => set({ name }),
  setMonthlyIncome: (income) => set({ monthlyIncome: income }),
  setConsentGiven: (given) => set({ consentGiven: given }),
  setIncludeMomoData: (value) => set({ includeMomoData: value }),
  toggleAccount: (key) =>
    set((s) => ({
      connectedAccounts: {
        ...s.connectedAccounts,
        [key]: !s.connectedAccounts[key],
      },
    })),
}));
