import type { AccountPreview } from "../../components/dashboard/AccountsCard";
import {
  ACCOUNT_PREVIEW_COLORS,
  ACCOUNT_TYPE_LABELS,
  DEFAULT_ACCOUNT_CURRENCY,
  INSTITUTION_COLORS,
} from "./account.constants";
import { ACCOUNT_TYPES, type AccountType, type FinancialAccount } from "./account.types";

const NAME_MIN = 2;
const NAME_MAX = 80;
const INSTITUTION_MAX = 80;

export function sanitizeAccountName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeInstitution(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isValidAccountName(value: string): boolean {
  const trimmed = sanitizeAccountName(value);
  return trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;
}

export function isValidInstitution(value: string): boolean {
  const trimmed = sanitizeInstitution(value);
  if (!trimmed) {
    return true;
  }
  return trimmed.length >= NAME_MIN && trimmed.length <= INSTITUTION_MAX;
}

export function isValidAccountType(value: string): value is AccountType {
  return (ACCOUNT_TYPES as readonly string[]).includes(value);
}

export function isValidCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

export function formatAccountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPE_LABELS[type];
}

export function formatAccountSubtitle(account: FinancialAccount): string {
  const parts = [
    account.institution,
    formatAccountTypeLabel(account.accountType),
  ].filter(Boolean);

  return parts.join(" · ");
}

export function formatAccountsCount(count: number): string {
  if (count === 0) {
    return "No accounts";
  }
  if (count === 1) {
    return "1 account";
  }
  return `${count} accounts`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function colorForAccount(account: FinancialAccount): string {
  const institutionKey = account.institution?.trim().toLowerCase() ?? "";
  if (institutionKey && INSTITUTION_COLORS[institutionKey]) {
    return INSTITUTION_COLORS[institutionKey];
  }

  const seed = institutionKey || account.name.toLowerCase();
  return ACCOUNT_PREVIEW_COLORS[hashString(seed) % ACCOUNT_PREVIEW_COLORS.length];
}

function previewKind(account: FinancialAccount): AccountPreview["kind"] {
  const institution = account.institution?.toLowerCase() ?? "";
  if (institution.includes("nedbank")) {
    return "nedbank";
  }
  if (account.accountType === "other") {
    return "wallet";
  }
  return "bank";
}

export function toAccountPreview(account: FinancialAccount): AccountPreview {
  return {
    id: account.id,
    name: account.name,
    masked: formatAccountSubtitle(account),
    balance: "—",
    color: colorForAccount(account),
    kind: previewKind(account),
  };
}

export function normalizeCreateAccountInput(input: {
  name: string;
  institution?: string;
  accountType: AccountType;
  currency?: string;
}): {
  name: string;
  institution: string | null;
  accountType: AccountType;
  currency: string;
} {
  const name = sanitizeAccountName(input.name);
  const institutionRaw = sanitizeInstitution(input.institution ?? "");
  const institution = institutionRaw.length > 0 ? institutionRaw : null;
  const currency = (input.currency ?? DEFAULT_ACCOUNT_CURRENCY).toUpperCase();

  if (!isValidAccountName(name)) {
    throw new Error("Enter an account name between 2 and 80 characters.");
  }
  if (!isValidInstitution(institutionRaw)) {
    throw new Error("Institution must be between 2 and 80 characters.");
  }
  if (!isValidAccountType(input.accountType)) {
    throw new Error("Choose a valid account type.");
  }
  if (!isValidCurrency(currency)) {
    throw new Error("Currency must be a 3-letter code.");
  }

  return {
    name,
    institution,
    accountType: input.accountType,
    currency,
  };
}
