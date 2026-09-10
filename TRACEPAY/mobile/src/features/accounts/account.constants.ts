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
};

export const ACCOUNT_PREVIEW_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#F97316",
  "#14B8A6",
  "#0EA5E9",
] as const;
