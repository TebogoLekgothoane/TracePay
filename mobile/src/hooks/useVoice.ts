import * as Speech from "expo-speech";
import { useProfileStore } from "@/stores/profileStore";
import { useCallback } from "react";

export function useVoice() {
  const voiceEnabled = useProfileStore((s) => s.voiceEnabled);
  const language = useProfileStore((s) => s.language);

  const getLocale = useCallback(() => {
    switch (language) {
      case "Afrikaans":
        return "af-ZA";
      case "isiNdebele":
        return "nr-ZA";
      case "isiXhosa":
        return "xh-ZA";
      case "isiZulu":
        return "zu-ZA";
      case "Sepedi":
        return "nso-ZA";
      case "Sesotho":
        return "st-ZA";
      case "Setswana":
        return "tn-ZA";
      case "siSwati":
        return "ss-ZA";
      case "Tshivenda":
        return "ve-ZA";
      case "Xitsonga":
        return "ts-ZA";
      default:
        return "en-ZA";
    }
  }, [language]);

  const speak = useCallback(
    (text: string) => {
      if (!voiceEnabled) return;
      Speech.stop();
      Speech.speak(text, {
        language: getLocale(),
        pitch: 1.0,
        rate: 0.9,
      });
    },
    [voiceEnabled, getLocale],
  );

  const stop = useCallback(() => {
    Speech.stop();
  }, []);

  return { speak, stop, voiceEnabled };
}
