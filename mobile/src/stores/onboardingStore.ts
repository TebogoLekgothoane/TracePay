import { create } from "zustand";

interface OnboardingState {
  selectedLanguage: string;
  includeMomoData: boolean;
  setSelectedLanguage: (lang: string) => void;
  setIncludeMomoData: (value: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  selectedLanguage: "English",
  includeMomoData: true,
  setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),
  setIncludeMomoData: (value) => set({ includeMomoData: value }),
}));
