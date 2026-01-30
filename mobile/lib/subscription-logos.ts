import { ImageSourcePropType } from "react-native";

const SUBSCRIPTION_LOGOS: Record<string, ImageSourcePropType> = {
  netflix: require("../assets/Netflix logo.jpg"),
  "netflix sa": require("../assets/Netflix logo.jpg"),
  showmax: require("../assets/showmax logo.jpg"),
  spotify: require("../assets/spotify logo.jpg"),
  dstv: require("../assets/dstv logo.jpg"),
  "dstv now": require("../assets/dstv logo.jpg"),
  youtube: require("../assets/youtube premium logo.jpg"),
  "youtube premium": require("../assets/youtube premium logo.jpg"),
  mtn: require("../assets/mtnmomo.jpg"),
  mtnmomo: require("../assets/mtnmomo.jpg"),
  "mtn momo": require("../assets/mtnmomo.jpg"),
};

/**
 * Returns the logo image source for a subscription or service name, or undefined if no match.
 * Matching is case-insensitive and supports partial names.
 */
export function getSubscriptionLogo(name: string): ImageSourcePropType | undefined {
  if (!name || typeof name !== "string") return undefined;
  const normalized = name.toLowerCase().trim();
  if (SUBSCRIPTION_LOGOS[normalized] != null) return SUBSCRIPTION_LOGOS[normalized];
  for (const key of Object.keys(SUBSCRIPTION_LOGOS)) {
    if (normalized.includes(key) || key.includes(normalized.replace(/\s+/g, ""))) {
      return SUBSCRIPTION_LOGOS[key];
    }
  }
  const noSpaces = normalized.replace(/\s+/g, "");
  for (const key of Object.keys(SUBSCRIPTION_LOGOS)) {
    const keyNoSpaces = key.replace(/\s+/g, "");
    if (noSpaces.includes(keyNoSpaces) || keyNoSpaces.includes(noSpaces)) {
      return SUBSCRIPTION_LOGOS[key];
    }
  }
  return undefined;
}
