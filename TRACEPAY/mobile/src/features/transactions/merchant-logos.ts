import { hunterLogoUrl } from "../accounts/account.constants";

export type MerchantCatalogEntry = {
  id: string;
  domain: string;
  patterns: RegExp[];
};

export type CatalogLogo = {
  brandId: string;
  domain: string;
};

/** Curated merchant → Hunter domain map for transaction descriptions. */
export const MERCHANT_CATALOG: MerchantCatalogEntry[] = [
  { id: "netflix", domain: "netflix.com", patterns: [/netflix/i] },
  { id: "spotify", domain: "spotify.com", patterns: [/spotify/i] },
  { id: "youtube", domain: "youtube.com", patterns: [/youtube|youtu\.be/i] },
  { id: "showmax", domain: "showmax.com", patterns: [/showmax/i] },
  { id: "dstv", domain: "dstv.com", patterns: [/dstv|multichoice/i] },
  { id: "mtn", domain: "mtn.co.za", patterns: [/\bmtn\b/i] },
  { id: "vodacom", domain: "vodacom.co.za", patterns: [/vodacom/i] },
  { id: "cellc", domain: "cellc.co.za", patterns: [/cell\s*c/i] },
  { id: "telkom", domain: "telkom.co.za", patterns: [/telkom/i] },
  { id: "engen", domain: "engen.co.za", patterns: [/engen/i] },
  { id: "shell", domain: "shell.co.za", patterns: [/\bshell\b/i] },
  { id: "bp", domain: "bp.com", patterns: [/\bbp\b/i] },
  { id: "sasol", domain: "sasol.com", patterns: [/sasol/i] },
  { id: "takealot", domain: "takealot.com", patterns: [/takealot/i] },
  { id: "shopee", domain: "shopee.co.za", patterns: [/shopee/i] },
  { id: "amazon", domain: "amazon.com", patterns: [/amazon/i] },
  { id: "uber", domain: "uber.com", patterns: [/uber/i] },
  { id: "bolt", domain: "bolt.eu", patterns: [/bolt/i] },
  { id: "shoprite", domain: "shoprite.co.za", patterns: [/shoprite/i] },
  { id: "checkers", domain: "checkers.co.za", patterns: [/checkers/i] },
  { id: "pnp", domain: "pnp.co.za", patterns: [/pick\s*n\s*pay|\bpnp\b/i] },
  { id: "woolworths", domain: "woolworths.co.za", patterns: [/woolworths|woolies/i] },
  { id: "mrprice", domain: "mrpricegroup.com", patterns: [/mr\s*price|mrprice|\bmrp\b/i] },
  { id: "clicks", domain: "clicks.co.za", patterns: [/clicks/i] },
  { id: "dischem", domain: "dischem.co.za", patterns: [/dischem/i] },
  { id: "kfc", domain: "kfc.co.za", patterns: [/\bkfc\b/i] },
  { id: "mcdonalds", domain: "mcdonalds.co.za", patterns: [/mcdonald/i] },
];

export function resolveMerchantLogoDomain(
  description: string | null | undefined,
): string | null {
  const text = description?.trim();
  if (!text) return null;

  for (const entry of MERCHANT_CATALOG) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return entry.domain;
    }
  }

  return null;
}

const CARD_PURCHASE_BOILERPLATE = /^(?:purchase\s+)?with\s+card\s+at(?:\s+epos(?:\s+at)?)?$/i;
const CATALOG_HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

const CATALOG_BY_KEY = new Map(
  MERCHANT_CATALOG.map((entry) => [entry.id, entry] as const),
);

export function isCatalogDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase();
  return (
    MERCHANT_CATALOG.some((entry) => entry.domain === normalized) &&
    CATALOG_HOSTNAME.test(normalized)
  );
}

/** Hunter URL for a catalogue domain. Display names and descriptions are rejected. */
export function catalogLogoUrl(domain: string): string | null {
  const normalized = domain.trim().toLowerCase();
  if (!isCatalogDomain(normalized)) {
    return null;
  }
  return hunterLogoUrl(normalized);
}

/** Exact catalogue match for a reliable display name. Does not scan descriptions. */
export function resolveCatalogLogo(
  displayName: string | null | undefined,
): CatalogLogo | null {
  const text = displayName?.trim();
  if (!text || CARD_PURCHASE_BOILERPLATE.test(text)) {
    return null;
  }
  if (/[/:]|https?:/i.test(text)) {
    return null;
  }
  const key = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const entry = CATALOG_BY_KEY.get(key);
  if (!entry || !isCatalogDomain(entry.domain)) {
    return null;
  }
  return { brandId: entry.id, domain: entry.domain };
}
