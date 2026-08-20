export type Transaction = {
  id: string;
  amount: number;
  currency: string;
  occurredAt: string;
};

export async function listTransactions(): Promise<Transaction[]> {
  return [];
}
