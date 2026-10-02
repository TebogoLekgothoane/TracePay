import type { AccountType } from "./account.types";

export const DEFAULT_ACCOUNT_CURRENCY = "ZAR";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cheque: "Cheque",
  savings: "Savings",
  credit_card: "Credit card",
  debit_card: "Debit card",
  investment: "Investment",
  other: "Other",
};

export const SA_INSTITUTIONS = [
  "Absa",
  "African Bank",
  "Capitec",
  "Discovery Bank",
  "FNB",
  "Investec",
  "Nedbank",
  "Standard Bank",
  "TymeBank",
] as const;

export type SaInstitution = (typeof SA_INSTITUTIONS)[number];

export function isSaInstitution(value: string): value is SaInstitution {
  return (SA_INSTITUTIONS as readonly string[]).includes(value);
}

export const INSTITUTION_COLORS: Record<string, string> = {
  absa: "#AF1685",
  "african bank": "#002F6C",
  capitec: "#7C3AED",
  "discovery bank": "#004B87",
  fnb: "#F97316",
  investec: "#003366",
  nedbank: "#16A34A",
  "standard bank": "#0033A0",
  tymebank: "#FACC15",
  gotyme: "#14B8A6",
};

/** Hunter Logo API — same approach as the previous TracePay mobile app. */
export const HUNTER_LOGO_BASE = "https://logos.hunter.io";

/** SA (and known) institutions → domain for Hunter logo lookup. */
export const INSTITUTION_LOGO_DOMAINS: Record<string, string> = {
  absa: "absa.co.za",
  "african bank": "africanbank.co.za",
  capitec: "capitec.co.za",
  "discovery bank": "discovery.co.za",
  discovery: "discovery.co.za",
  fnb: "fnb.co.za",
  investec: "investec.com",
  nedbank: "nedbank.co.za",
  "standard bank": "standardbank.co.za",
  tymebank: "tymebank.co.za",
  "tyme bank": "tymebank.co.za",
  gotyme: "gotyme.com.ph",
  "go tyme": "gotyme.com.ph",
  "gotyme bank": "gotyme.com.ph",
  "go tyme bank": "gotyme.com.ph",
};

export function hunterLogoUrl(domain: string): string {
  return `${HUNTER_LOGO_BASE}/${domain.trim().toLowerCase()}`;
}

export function resolveInstitutionLogoDomain(
  institution: string | null | undefined,
): string | null {
  const text = institution?.trim().toLowerCase();
  if (!text) return null;

  const exact = INSTITUTION_LOGO_DOMAINS[text];
  if (exact) return exact;

  for (const [key, domain] of Object.entries(INSTITUTION_LOGO_DOMAINS)) {
    if (text.includes(key) || key.includes(text)) {
      return domain;
    }
  }

  return null;
}

export const ACCOUNT_PREVIEW_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#F97316",
  "#14B8A6",
  "#0EA5E9",
] as const;
