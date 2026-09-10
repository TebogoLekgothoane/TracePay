export const ACCOUNT_TYPES = [
  "cheque",
  "savings",
  "credit_card",
  "debit_card",
  "investment",
  "other",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type FinancialAccount = {
  id: string;
  userId: string;
  name: string;
  institution: string | null;
  accountType: AccountType;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAccountInput = {
  name: string;
  institution?: string;
  accountType: AccountType;
  currency?: string;
};

export type UpdateAccountInput = {
  id: string;
  name?: string;
  institution?: string | null;
  accountType?: AccountType;
};
