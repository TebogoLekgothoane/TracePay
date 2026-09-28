export type TransactionType = "debit" | "credit";
export type CategorySource = "automatic" | "manual";

export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  amount: number | string;
  type: TransactionType;
  balance: number | string | null;
  currency: string | null;
  category_id: string | null;
  category_source: CategorySource;
  categories: { name: string } | { name: string }[] | null;
};
