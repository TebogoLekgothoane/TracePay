export const ACCOUNT_TYPES = [
  "cheque",
  "savings",
  "credit_card",
  "debit_card",
  "investment",
  "other",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CONNECTION_SOURCES = [
  "manual",
  "statement_import",
  "open_banking",
] as const;

export type ConnectionSource = (typeof CONNECTION_SOURCES)[number];

export type FinancialAccount = {
  id: string;
  userId: string;
  /** User-facing nickname. Bank/institution is stored separately. */
  name: string;
  institution: string | null;
  accountType: AccountType;
  currency: string;
  lastFourDigits: string | null;
  connectionSource: ConnectionSource;
  createdAt: string;
  updatedAt: string;
};

export type CreateAccountInput = {
  name: string;
  institution?: string;
  accountType: AccountType;
  currency?: string;
  lastFourDigits?: string;
  connectionSource?: ConnectionSource;
};
