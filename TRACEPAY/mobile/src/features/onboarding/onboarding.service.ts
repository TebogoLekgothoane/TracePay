import { secureStorage } from "../../lib/secure-storage";
import {
  DEFAULT_ONBOARDING_LANGUAGE,
  ONBOARDING_LANGUAGES,
  ONBOARDING_STORAGE_KEYS,
} from "./onboarding.constants";
import type { OnboardingLanguage } from "./onboarding.types";

export function isOnboardingLanguage(
  value: string,
): value is OnboardingLanguage {
  return (ONBOARDING_LANGUAGES as readonly string[]).includes(value);
}

export function parseOnboardingLanguage(value: string | null): OnboardingLanguage {
  if (value && isOnboardingLanguage(value)) {
    return value;
  }

  return DEFAULT_ONBOARDING_LANGUAGE;
}

export async function loadOnboardingCompleted(): Promise<boolean> {
  const value = await secureStorage.get(ONBOARDING_STORAGE_KEYS.completed);
  return value === "1";
}

export async function loadOnboardingLanguage(): Promise<OnboardingLanguage> {
  const value = await secureStorage.get(ONBOARDING_STORAGE_KEYS.language);
  return parseOnboardingLanguage(value);
}

export async function persistOnboardingLanguage(
  language: OnboardingLanguage,
): Promise<void> {
  await secureStorage.set(ONBOARDING_STORAGE_KEYS.language, language);
}

export async function completeOnboarding(
  language: OnboardingLanguage,
): Promise<void> {
  await persistOnboardingLanguage(language);
  await secureStorage.set(ONBOARDING_STORAGE_KEYS.completed, "1");
}
