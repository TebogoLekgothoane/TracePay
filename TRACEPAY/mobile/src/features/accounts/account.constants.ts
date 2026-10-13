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

/**
 * How each SA bank typically locks e-statement PDFs.
 * Shown on the unlock screen so users don't guess the wrong format.
 */
export const STATEMENT_PDF_PASSWORD_TIPS: Partial<
  Record<SaInstitution, string>
> = {
  Absa: "Usually your full 13-digit SA ID number, with no spaces.",
  "African Bank": "Usually your full 13-digit SA ID number, with no spaces.",
  Capitec:
    "App downloads are often unlocked. Emailed PDFs may use the last 4 digits of your mobile number.",
  "Discovery Bank": "Usually your full 13-digit SA ID number, with no spaces.",
  FNB: "Usually the last 4 digits of your SA ID plus the last 4 digits of your account number.",
  Investec: "Use the password from your Investec statement email or download.",
  Nedbank:
    "Usually your full 13-digit SA ID number, or your date of birth as DDMMYYYY.",
  "Standard Bank":
    "Usually the last 6 digits of your SA ID (no spaces). If that fails, try the full 13-digit ID, or open the PDF in your phone’s Files app to confirm the password.",
  TymeBank: "Use the password from your TymeBank statement email or download.",
};

export function statementPdfPasswordTip(
  bankName: string | null | undefined,
): string | null {
  if (!bankName || !isSaInstitution(bankName)) return null;
  return STATEMENT_PDF_PASSWORD_TIPS[bankName] ?? null;
}

export function incorrectPdfPasswordMessage(
  bankName: string | null | undefined,
): string {
  if (bankName === "Standard Bank") {
    return "That password didn't work. Try the last 6 digits of your SA ID, then the full 13-digit ID with no spaces. Confirm it opens in Files before retrying here.";
  }
  if (bankName === "FNB") {
    return "That password didn't work. FNB usually needs the last 4 digits of your SA ID plus the last 4 of your account number.";
  }
  return "That password didn't work. Check the format tip below and try again.";
}

/** Banks shown on the statement import screen, in display order. */
export const STATEMENT_IMPORT_BANKS = [
  { name: "Capitec", hint: "Transaction history or account statement" },
  { name: "FNB", hint: "Online or app statement export" },
  { name: "Discovery Bank", hint: "Monthly Discovery Bank statement" },
  { name: "Absa", hint: "E-stamped transaction history" },
  { name: "African Bank", hint: "Supported account statement" },
  { name: "Investec", hint: "Bank account statement" },
  { name: "Nedbank", hint: "Current-account statement" },
  { name: "Standard Bank", hint: "Online banking statement export" },
  { name: "TymeBank", hint: "Monthly personal statement" },
] as const satisfies ReadonlyArray<{
  name: SaInstitution;
  hint: string;
}>;

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

/**
 * Hunter serves a broken Absa mark on absa.co.za (black square / missing image).
 * Serve the real Absa PNG from our public CDN instead.
 */
const LOGO_CDN_OVERRIDES: Record<string, string> = {
  "absa.co.za": "brands/absa.png",
  "absa.africa": "brands/absa.png",
  "airtime-advance.tracepay": "brands/airtime-advance.png",
  "payment-received.tracepay": "brands/payment-received.png",
};

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

function supabaseAppAssetUrl(objectPath: string): string | null {
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/app-assets/${objectPath.replace(/^\/+/, "")}`;
}

export function hunterLogoUrl(domain: string): string {
  const normalized = domain.trim().toLowerCase();
  const overridePath = LOGO_CDN_OVERRIDES[normalized];
  if (overridePath) {
    const cdnUrl = supabaseAppAssetUrl(overridePath);
    if (cdnUrl) return cdnUrl;
  }
  return `${HUNTER_LOGO_BASE}/${normalized}`;
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
  "#8B5CF6",
  "#9A6CFF",
  "#EC4899",
  "#F97316",
  "#14B8A6",
  "#0EA5E9",
] as const;
