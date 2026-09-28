import {
  siApple,
  siApplemusic,
  siDropbox,
  siFigma,
  siFitbit,
  siGoogle,
  siGoogleplay,
  siKfc,
  siMastercard,
  siMcdonalds,
  siNetflix,
  siNotion,
  siPaypal,
  siShell,
  siShopee,
  siSpotify,
  siUber,
  siVisa,
  siYoutube,
  siZoom,
  type SimpleIcon,
} from "simple-icons";

/**
 * Curated Simple Icons map for merchant / subscription brand marks.
 * Source: https://github.com/simple-icons/simple-icons
 * (Same icon set as @icons-pack/react-simple-icons; that package is web-DOM only.)
 */
export const BRAND_ICONS: Record<string, SimpleIcon> = {
  netflix: siNetflix,
  spotify: siSpotify,
  youtube: siYoutube,
  shopee: siShopee,
  uber: siUber,
  shell: siShell,
  mcdonalds: siMcdonalds,
  kfc: siKfc,
  fitbit: siFitbit,
  apple: siApple,
  googleplay: siGoogleplay,
  visa: siVisa,
  mastercard: siMastercard,
  paypal: siPaypal,
  applemusic: siApplemusic,
  dropbox: siDropbox,
  google: siGoogle,
  notion: siNotion,
  figma: siFigma,
  zoom: siZoom,
};

/** Hunter / catalog domains → brand id when a Simple Icon exists. */
export const DOMAIN_TO_BRAND_ID: Record<string, string> = {
  "netflix.com": "netflix",
  "spotify.com": "spotify",
  "youtube.com": "youtube",
  "shopee.co.za": "shopee",
  "shopee.com": "shopee",
  "uber.com": "uber",
  "shell.com": "shell",
  "shell.co.za": "shell",
  "mcdonalds.com": "mcdonalds",
  "mcdonalds.co.za": "mcdonalds",
  "kfc.com": "kfc",
  "kfc.co.za": "kfc",
  "fitbit.com": "fitbit",
  "apple.com": "apple",
  "play.google.com": "googleplay",
  "visa.com": "visa",
  "mastercard.com": "mastercard",
  "paypal.com": "paypal",
  "music.apple.com": "applemusic",
  "dropbox.com": "dropbox",
  "google.com": "google",
  "notion.so": "notion",
  "figma.com": "figma",
  "zoom.us": "zoom",
};

export function resolveBrandIcon(
  brandIdOrDomain: string | null | undefined,
): SimpleIcon | null {
  const key = brandIdOrDomain?.trim().toLowerCase();
  if (!key) return null;

  if (BRAND_ICONS[key]) return BRAND_ICONS[key];

  const fromDomain = DOMAIN_TO_BRAND_ID[key];
  if (fromDomain && BRAND_ICONS[fromDomain]) {
    return BRAND_ICONS[fromDomain];
  }

  return null;
}

export function brandHex(icon: SimpleIcon): string {
  return `#${icon.hex}`;
}
