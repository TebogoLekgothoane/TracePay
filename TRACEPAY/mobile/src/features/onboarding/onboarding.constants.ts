import OnboardingOverview from "../../../assets/images/onboarding/onb 1.svg";
import OnboardingLeaks from "../../../assets/images/onboarding/onb 2.svg";
import OnboardingPrivacy from "../../../assets/images/onboarding/onb 3.svg";
import OnboardingAction from "../../../assets/images/onboarding/onb 4.svg";
import type { OnboardingInfoSlide, OnboardingPage } from "./onboarding.types";

export const ONBOARDING_LANGUAGES = [
  "English",
  "isiXhosa",
  "Afrikaans",
  "Sesotho",
  "Setswana",
  "isiZulu",
] as const;

export const DEFAULT_ONBOARDING_LANGUAGE = ONBOARDING_LANGUAGES[0];

export const ONBOARDING_INFO_SLIDES: readonly OnboardingInfoSlide[] = [
  {
    id: "overview",
    title: "See the full picture of your money",
    description:
      "We analyze your transactions to show you where your money is really going.",
    actionLabel: "Next",
    Illustration: OnboardingOverview,
    aspectRatio: 1312 / 1199,
  },
  {
    id: "leaks",
    title: "We find the leaks you don't see",
    description:
      "From bank fees to subscriptions, we uncover the hidden leaks draining your money.",
    actionLabel: "Next",
    Illustration: OnboardingLeaks,
    aspectRatio: 1536 / 1024,
  },
  {
    id: "privacy",
    title: "Your data is safe and private",
    description:
      "We use bank-level security to protect your data and your privacy.",
    actionLabel: "Next",
    Illustration: OnboardingPrivacy,
    aspectRatio: 1536 / 1024,
  },
  {
    id: "action",
    title: "Take action. Save more. Stress less.",
    description:
      "Get personalized steps to stop leaks and take control of your money.",
    actionLabel: "Get started",
    Illustration: OnboardingAction,
    aspectRatio: 1536 / 1024,
  },
];

export const ONBOARDING_PAGES: readonly OnboardingPage[] = [
  ...ONBOARDING_INFO_SLIDES.map((slide) => ({
    key: slide.id,
    kind: "info" as const,
    slide,
  })),
  { key: "language", kind: "language" },
];

export const ONBOARDING_PAGE_COUNT = ONBOARDING_PAGES.length;
export const ONBOARDING_LAST_INDEX = ONBOARDING_PAGE_COUNT - 1;
export const ONBOARDING_PAGINATION_INDICES = ONBOARDING_PAGES.map(
  (_, index) => index,
);

export const ONBOARDING_STORAGE_KEYS = {
  completed: "tracepay.onboarding.completed.v1",
  language: "tracepay.onboarding.language.v1",
} as const;

export const ONBOARDING_AUTH_ROUTE = "/(auth)/welcome" as const;
