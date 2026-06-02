import * as Speech from "expo-speech";
import { useProfileStore } from "@/stores/profileStore";
import { useCallback } from "react";

export function useVoice() {
  const voiceEnabled = useProfileStore((s) => s.voiceEnabled);
  const language = useProfileStore((s) => s.language);

  const getLocale = () => {
    switch (language) {
      case "isiXhosa": return "xh-ZA";
      case "isiZulu": return "zu-ZA";
      case "Sesotho": return "st-ZA";
      default: return "en-ZA";
    }
  };

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
    [voiceEnabled, language]
  );

  const stop = useCallback(() => {
    Speech.stop();
  }, []);

  return { speak, stop, voiceEnabled };
}
