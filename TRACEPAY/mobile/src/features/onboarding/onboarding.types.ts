import type { FunctionComponent } from "react";
import type { SvgProps } from "react-native-svg";

export type OnboardingLanguage =
  | "English"
  | "isiXhosa"
  | "Afrikaans"
  | "Sesotho"
  | "Setswana"
  | "isiZulu";

export type OnboardingIllustration = FunctionComponent<SvgProps>;

export type OnboardingInfoSlide = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  Illustration: OnboardingIllustration;
  aspectRatio: number;
};

export type OnboardingPage =
  | { key: string; kind: "info"; slide: OnboardingInfoSlide }
  | { key: string; kind: "language" };
