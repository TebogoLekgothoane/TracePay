import {
  hunterLogoUrl,
  INSTITUTION_LOGO_DOMAINS,
} from "../accounts/account.constants";
import {
  extractMerchantCandidate,
  looksLikeAirtimeAdvance,
  looksLikePaymentReceived,
} from "./merchant-extract";

export type MerchantCatalogEntry = {
  id: string;
  domain: string;
  patterns: RegExp[];
};

export type CatalogLogo = {
  brandId: string;
  domain: string;
};

/** Special CDN keys resolved via LOGO_CDN_OVERRIDES in account.constants. */
export const AIRTIME_ADVANCE_LOGO_DOMAIN = "airtime-advance.tracepay";
export const PAYMENT_RECEIVED_LOGO_DOMAIN = "payment-received.tracepay";

/** Curated merchant → Hunter domain map for transaction descriptions. */
export const MERCHANT_CATALOG: MerchantCatalogEntry[] = [
  { id: "netflix", domain: "netflix.com", patterns: [/netflix/i] },
  { id: "spotify", domain: "spotify.com", patterns: [/spotify/i] },
  { id: "youtube", domain: "youtube.com", patterns: [/youtube|youtu\.be/i] },
  { id: "showmax", domain: "showmax.com", patterns: [/showmax/i] },
  { id: "dstv", domain: "dstv.com", patterns: [/dstv|multichoice/i] },
  {
    id: "capcut",
    domain: "capcut.com",
    patterns: [/cap\s*cut|capcut/i],
  },
  {
    id: "googleone",
    domain: "one.google.com",
    patterns: [/google\s*one/i],
  },
  {
    id: "openart",
    domain: "openart.ai",
    patterns: [/open\s*art/i],
  },
  { id: "adobe", domain: "adobe.com", patterns: [/\badobe\b|creative\s*cloud/i] },
  { id: "microsoft", domain: "microsoft.com", patterns: [/microsoft|\boffice\s*365\b|\bm365\b/i] },
  { id: "discord", domain: "discord.com", patterns: [/discord/i] },
  { id: "apple", domain: "apple.com", patterns: [/\bapple\b|itunes|app\s*store/i] },
  { id: "google", domain: "google.com", patterns: [/\bgoogle\b(?!\s*one)/i] },
  // MoMo / wallet rails before generic network matches (order matters).
  {
    id: "mtnmomo",
    domain: "momo.mtn.co.za",
    patterns: [/mtn\s*momo|mtnmomo|momo\s*mtn|momo\.mtn|\bmomo\b/i],
  },
  {
    id: "vodapay",
    domain: "vodapay.vodacom.co.za",
    patterns: [/voda\s*pay|vodapay|vodacom\s*momo/i],
  },
  { id: "mtn", domain: "mtn.co.za", patterns: [/\bmtn\b/i] },
  { id: "vodacom", domain: "vodacom.co.za", patterns: [/vodacom|voda\b/i] },
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
  { id: "payshap", domain: "payshap.co.za", patterns: [/pay\s*shap|payshap/i] },
];

/** Alias keys (no spaces/punct) → Hunter domain when extraction finds a free-text merchant. */
const MERCHANT_ALIAS_DOMAINS: Record<string, string> = {
  capcut: "capcut.com",
  capcutvideo: "capcut.com",
  googlecapcut: "capcut.com",
  googlecapcutvideo: "capcut.com",
  googleone: "one.google.com",
  openart: "openart.ai",
  openartai: "openart.ai",
  adobe: "adobe.com",
  microsoft: "microsoft.com",
  discord: "discord.com",
  netflix: "netflix.com",
  spotify: "spotify.com",
  youtube: "youtube.com",
  showmax: "showmax.com",
  dstv: "dstv.com",
  uber: "uber.com",
  ubereats: "uber.com",
  bolt: "bolt.eu",
  takealot: "takealot.com",
  amazon: "amazon.com",
  apple: "apple.com",
  google: "google.com",
  mtn: "mtn.co.za",
  mtnmomo: "momo.mtn.co.za",
  vodacom: "vodacom.co.za",
  vodapay: "vodapay.vodacom.co.za",
  cellc: "cellc.co.za",
  telkom: "telkom.co.za",
  payshap: "payshap.co.za",
};

/** SA bank-rail / P2P transfer wording commonly seen on statements. */
export const BANK_TRANSFER_HINT =
  /\b(?:eft|rtc|rtgs|ib\s*payment|immediate\s*payment|instant\s*payment|digital\s*payment|money\s*transfer|transfer|pay\s*shap|payshap|aedo|naedo|debit\s*order)\b/i;

/** Prepaid airtime / data / advance lines on SA bank statements. */
export const AIRTIME_PURCHASE_HINT =
  /\b(?:airtime\s*adv(?:ance)?|data\s*adv(?:ance)?|airtime|prepaid|top[\s-]*up|bundle|out[\s-]*of[\s-]*bundle|oobo)\b/i;

const NETWORK_LOGO_ENTRIES: MerchantCatalogEntry[] = MERCHANT_CATALOG.filter(
  (entry) =>
    entry.id === "mtnmomo" ||
    entry.id === "vodapay" ||
    entry.id === "mtn" ||
    entry.id === "vodacom" ||
    entry.id === "cellc" ||
    entry.id === "telkom",
);

const INSTITUTION_KEYS_LONGEST_FIRST = Object.keys(INSTITUTION_LOGO_DOMAINS).sort(
  (left, right) => right.length - left.length,
);

function aliasKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

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

export function resolveLogoDomainFromMerchantLabel(
  merchant: string | null | undefined,
): string | null {
  const text = merchant?.trim();
  if (!text) return null;

  const fromCatalog = resolveMerchantLogoDomain(text);
  if (fromCatalog) return fromCatalog;

  const alias = MERCHANT_ALIAS_DOMAINS[aliasKey(text)];
  if (alias) return alias;

  // Try first token aliases ("Capcut Video" → capcut).
  const first = text.split(/\s+/)[0];
  if (first) {
    const firstAlias = MERCHANT_ALIAS_DOMAINS[aliasKey(first)];
    if (firstAlias) return firstAlias;
  }

  return resolveBankLogoFromDescription(text);
}

/** Hunter domain when a statement line names a South African bank (EFT/RTC style). */
export function resolveBankLogoFromDescription(
  description: string | null | undefined,
): string | null {
  const text = description?.trim().toLowerCase();
  if (!text) return null;

  for (const key of INSTITUTION_KEYS_LONGEST_FIRST) {
    if (text.includes(key)) {
      return INSTITUTION_LOGO_DOMAINS[key] ?? null;
    }
  }

  return null;
}

export function looksLikeBankTransfer(
  description: string | null | undefined,
  category: string | null | undefined,
  transactionClass: string | null | undefined,
): boolean {
  const categoryKey = category?.trim().toLowerCase() ?? "";
  const classKey = transactionClass?.trim().toLowerCase() ?? "";
  if (
    categoryKey.includes("transfer") ||
    classKey.includes("transfer") ||
    classKey === "person_to_person"
  ) {
    return true;
  }
  return BANK_TRANSFER_HINT.test(description ?? "");
}

export function looksLikeAirtimePurchase(
  description: string | null | undefined,
  category: string | null | undefined,
  transactionClass: string | null | undefined,
): boolean {
  const categoryKey = category?.trim().toLowerCase() ?? "";
  const classKey = transactionClass?.trim().toLowerCase() ?? "";
  if (
    categoryKey.includes("airtime") ||
    categoryKey.includes("data") ||
    classKey.includes("airtime") ||
    classKey.includes("data")
  ) {
    return true;
  }
  return AIRTIME_PURCHASE_HINT.test(description ?? "");
}

export function resolveNetworkLogoFromDescription(
  description: string | null | undefined,
): string | null {
  const text = description?.trim();
  if (!text) return null;

  for (const entry of NETWORK_LOGO_ENTRIES) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return entry.domain;
    }
  }

  return null;
}

export type TransactionLogoResolution = {
  domain: string | null;
  /** When no brand domain, show person initials (payment received / P2P). */
  initials: string | null;
  kind:
    | "merchant"
    | "network"
    | "bank"
    | "airtime_advance"
    | "payment_received"
    | "person"
    | "none";
};

/**
 * Resolve list icon brand:
 * 1) DB merchant_name (rules + AI at import)
 * 2) Catalogue match on full description
 * 3) Extracted merchant candidate from description
 * 4) Airtime advance / payment received / transfer fallbacks
 */
export function resolveTransactionLogo(input: {
  description: string | null | undefined;
  merchantName?: string | null;
  category: string | null | undefined;
  transactionClass: string | null | undefined;
  accountInstitution?: string | null;
  type?: string | null;
}): TransactionLogoResolution {
  const fromStored = resolveLogoDomainFromMerchantLabel(input.merchantName);
  if (fromStored) {
    return { domain: fromStored, initials: null, kind: "merchant" };
  }

  const fromDescription = resolveMerchantLogoDomain(input.description);
  if (fromDescription) {
    return { domain: fromDescription, initials: null, kind: "merchant" };
  }

  const extracted = extractMerchantCandidate(input.description);
  const fromExtracted = resolveLogoDomainFromMerchantLabel(extracted);
  if (fromExtracted) {
    return { domain: fromExtracted, initials: null, kind: "merchant" };
  }

  if (looksLikeAirtimeAdvance(input.description)) {
    const network = resolveNetworkLogoFromDescription(input.description);
    if (network) {
      return { domain: network, initials: null, kind: "network" };
    }
    return {
      domain: AIRTIME_ADVANCE_LOGO_DOMAIN,
      initials: null,
      kind: "airtime_advance",
    };
  }

  if (
    looksLikeAirtimePurchase(
      input.description,
      input.category,
      input.transactionClass,
    )
  ) {
    const network = resolveNetworkLogoFromDescription(input.description);
    if (network) {
      return { domain: network, initials: null, kind: "network" };
    }
  }

  if (looksLikePaymentReceived(input.description, input.type)) {
    const bank = resolveBankLogoFromDescription(input.description);
    if (bank) {
      return { domain: bank, initials: null, kind: "bank" };
    }
    if (extracted && !/\b(?:payment|transfer|received)\b/i.test(extracted)) {
      const brand = resolveLogoDomainFromMerchantLabel(extracted);
      if (brand) {
        return { domain: brand, initials: null, kind: "merchant" };
      }
      return {
        domain: null,
        initials: extracted
          .split(/\s+/)
          .map((part) => part.replace(/[^a-zA-Z]/g, ""))
          .filter(Boolean)
          .slice(0, 2)
          .map((part, index, all) =>
            all.length === 1 ? part.slice(0, 2) : part[0] ?? "",
          )
          .join("")
          .toUpperCase() || null,
        kind: "person",
      };
    }
    return {
      domain: PAYMENT_RECEIVED_LOGO_DOMAIN,
      initials: null,
      kind: "payment_received",
    };
  }

  const isTransfer = looksLikeBankTransfer(
    input.description,
    input.category,
    input.transactionClass,
  );
  if (isTransfer) {
    const counterpartyBank = resolveBankLogoFromDescription(input.description);
    if (counterpartyBank) {
      return { domain: counterpartyBank, initials: null, kind: "bank" };
    }

    const ownBank = resolveBankLogoFromDescription(input.accountInstitution);
    if (
      ownBank &&
      (input.transactionClass ?? "").toLowerCase().includes("internal")
    ) {
      return { domain: ownBank, initials: null, kind: "bank" };
    }

    if (extracted) {
      return {
        domain: null,
        initials: extracted
          .split(/\s+/)
          .map((part) => part.replace(/[^a-zA-Z]/g, ""))
          .filter(Boolean)
          .slice(0, 2)
          .map((part, index, all) =>
            all.length === 1 ? part.slice(0, 2) : part[0] ?? "",
          )
          .join("")
          .toUpperCase() || null,
        kind: "person",
      };
    }
  }

  return { domain: null, initials: null, kind: "none" };
}

/** @deprecated Prefer resolveTransactionLogo */
export function resolveTransactionLogoDomain(input: {
  description: string | null | undefined;
  category: string | null | undefined;
  transactionClass: string | null | undefined;
  accountInstitution?: string | null;
  merchantName?: string | null;
  type?: string | null;
}): string | null {
  return resolveTransactionLogo(input).domain;
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
