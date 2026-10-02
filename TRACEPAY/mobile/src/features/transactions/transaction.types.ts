export type TransactionType = "debit" | "credit";
export type CategorySource = "automatic" | "manual";
export type TransactionSource = "statement" | "open_banking" | "manual";

export type TransactionAccount = {
  id: string;
  name: string;
  institution: string | null;
  accountType: string;
};

export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  amount: number | string;
  type: TransactionType;
  balance: number | string | null;
  currency: string | null;
  account_id: string;
  statement_id: string | null;
  source: TransactionSource;
  transaction_class: string | null;
  is_duplicate: boolean;
  category_id: string | null;
  category_source: CategorySource;
  categories: { name: string } | { name: string }[] | null;
  account: TransactionAccount | null;
};
