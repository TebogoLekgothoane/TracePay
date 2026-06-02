import { ImageSourcePropType } from "react-native";

const BANK_LOGOS: Record<string, ImageSourcePropType> = {
  absa: require("../assets/absa_logo.jpg"),
  capitec: require("../assets/Capitec_logo.png"),
  nedbank: require("../assets/NEDBANK LOGO.jpg"),
  "standard bank": require("../assets/Standard Bank Logo.jpg"),
  standard: require("../assets/Standard Bank Logo.jpg"),
  vodacom: require("../assets/Vodacom Logo.jpg"),
  vodapay: require("../assets/Vodacom Logo.jpg"),
  tymebank: require("../assets/tymebank_logo.jpg"),
  tyme: require("../assets/tymebank_logo.jpg"),
  mtn: require("../assets/mtnmomo.jpg"),
  mtnmomo: require("../assets/mtnmomo.jpg"),
  "mtn momo": require("../assets/mtnmomo.jpg"),
};

/**
 * Returns the logo image source for a bank or account name, or undefined if no match.
 * Matching is case-insensitive and supports partial names (e.g. "Standard Bank", "TymeBank").
 */
export function getBankLogo(name: string): ImageSourcePropType | undefined {
  if (!name || typeof name !== "string") return undefined;
  const normalized = name.toLowerCase().trim();
  // Exact key match
  if (BANK_LOGOS[normalized] != null) return BANK_LOGOS[normalized];
  // Partial match: check if any key is contained in name or name is contained in key
  for (const key of Object.keys(BANK_LOGOS)) {
    if (normalized.includes(key) || key.includes(normalized.replace(/\s+/g, ""))) {
      return BANK_LOGOS[key];
    }
  }
  // Try without spaces for "standard bank" -> "standardbank" etc.
  const noSpaces = normalized.replace(/\s+/g, "");
  for (const key of Object.keys(BANK_LOGOS)) {
    const keyNoSpaces = key.replace(/\s+/g, "");
    if (noSpaces.includes(keyNoSpaces) || keyNoSpaces.includes(noSpaces)) {
      return BANK_LOGOS[key];
    }
  }
  return undefined;
}
