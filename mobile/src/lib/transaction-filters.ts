import { ParsedTransaction } from '@/services/sms/sms.types';

export type DateRangeFilter = 'all' | '7d' | '30d' | '90d';

export const DATE_RANGE_OPTIONS: { id: DateRangeFilter; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

const RANGE_DAYS: Record<Exclude<DateRangeFilter, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export function getTransactionDate(tx: ParsedTransaction): Date {
  return tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp);
}

export function getTransactionTime(tx: ParsedTransaction): number {
  return getTransactionDate(tx).getTime();
}

export function formatDateLabel(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = now.getTime() - d.getTime();
  if (diff === 0) return "Today";
  if (diff === 86_400_000) return "Yesterday";
  return date.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function filterTransactionsByDateRange(
  transactions: ParsedTransaction[],
  range: DateRangeFilter
): ParsedTransaction[] {
  if (range === 'all') return transactions;

  const cutoff = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  return transactions.filter((tx) => getTransactionTime(tx) >= cutoff);
}
