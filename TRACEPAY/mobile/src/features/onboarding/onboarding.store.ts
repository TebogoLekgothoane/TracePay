import { useSyncExternalStore } from "react";

import { DEFAULT_ONBOARDING_LANGUAGE } from "./onboarding.constants";
import { isOnboardingLanguage } from "./onboarding.service";
import type { OnboardingLanguage } from "./onboarding.types";

let selectedLanguage: OnboardingLanguage = DEFAULT_ONBOARDING_LANGUAGE;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): OnboardingLanguage {
  return selectedLanguage;
}

export function setOnboardingLanguage(language: string): void {
  if (!isOnboardingLanguage(language) || language === selectedLanguage) {
    return;
  }

  selectedLanguage = language;
  emit();
}

export function useOnboardingLanguage(): OnboardingLanguage {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
