import type {
  ParsedTransaction,
  TransactionCategory,
  TransactionType,
} from '../sms.types';
import { getDemoSmsUrl } from '../smsSource';
import { enrichParsedTransaction } from '@/lib/transaction-display';

const DEMO_FETCH_TIMEOUT_MS = 15_000;

interface RemoteDemoTransaction {
  transaction_id?: unknown;
  id?: unknown;
  user_id?: unknown;
  date?: unknown;
  timestamp?: unknown;
  category?: unknown;
  merchant?: unknown;
  amount?: unknown;
  direction?: unknown;
  bank?: unknown;
  channel?: unknown;
  description?: unknown;
  leak_tag?: unknown;
}

const CATEGORY_MAP: Record<string, TransactionCategory> = {
  groceries: 'groceries',
  fuel: 'fuel',
  dining: 'dining',
  fast_food: 'dining',
  coffee: 'dining',
  food_delivery: 'dining',
  entertainment: 'entertainment',
  streaming: 'entertainment',
  utilities: 'utilities',
  airtime: 'utilities',
  data: 'utilities',
  transfer: 'transfer',
  atm: 'atm',
  cash: 'atm',
  online: 'online',
  ecommerce: 'online',
  medical: 'medical',
  health: 'medical',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapDirection(value: unknown, amount: number): TransactionType {
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'credit' || normalised === 'inflow') return 'credit';
    if (normalised === 'debit' || normalised === 'outflow') return 'debit';
    if (normalised === 'reversal' || normalised === 'reversed') return 'reversal';
  }
  return amount < 0 ? 'debit' : 'credit';
}

function mapCategory(value: unknown): TransactionCategory {
  if (!isNonEmptyString(value)) return 'other';
  const key = value.trim().toLowerCase();
  return CATEGORY_MAP[key] ?? 'other';
}

function mapBank(value: unknown): string {
  if (!isNonEmptyString(value)) return 'UNKNOWN';
  const normalised = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalised === 'ABSA') return 'ABSA';
  if (normalised === 'STANDARD_BANK' || normalised === 'STANDARDBANK') {
    return 'STANDARD_BANK';
  }
  if (normalised === 'TYMEBANK' || normalised === 'TYME_BANK') return 'TYMEBANK';
  return normalised;
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value);
  }
  if (!isNonEmptyString(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractTransactionList(payload: unknown): RemoteDemoTransaction[] {
  if (Array.isArray(payload)) {
    return payload as RemoteDemoTransaction[];
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Demo dataset must be a JSON object or array');
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.transactions)) {
    return record.transactions as RemoteDemoTransaction[];
  }
  if (Array.isArray(record.alerts)) {
    throw new Error(
      'Demo URL returned SMS alerts. Use a transaction dataset with a "transactions" array.'
    );
  }

  throw new Error('Demo dataset must include a "transactions" array');
}

function toParsedTransaction(
  item: RemoteDemoTransaction,
  index: number
): ParsedTransaction | null {
  const amountRaw = asFiniteNumber(item.amount);
  if (amountRaw === null || amountRaw === 0) return null;

  const timestamp =
    parseTimestamp(item.timestamp) ?? parseTimestamp(item.date);
  if (!timestamp) return null;

  const type = mapDirection(item.direction, amountRaw);
  const amount = Math.abs(amountRaw);
  const merchant = isNonEmptyString(item.merchant)
    ? item.merchant.trim()
    : undefined;
  const description = isNonEmptyString(item.description)
    ? item.description.trim()
    : merchant ?? 'Transaction';
  const idSeed = isNonEmptyString(item.transaction_id)
    ? item.transaction_id.trim()
    : isNonEmptyString(item.id)
      ? item.id.trim()
      : `demo_${index}`;

  return enrichParsedTransaction({
    id: idSeed.startsWith('tx_') || idSeed.startsWith('demo_')
      ? idSeed
      : `demo_${idSeed}`,
    rawSmsId: `demo_source_${idSeed}`,
    bank: mapBank(item.bank),
    type,
    amount,
    currency: 'ZAR',
    merchant,
    summary: description,
    timestamp,
    category: mapCategory(item.category),
    rawBody: description,
    parsedAt: new Date(),
    confidence: 'high',
  });
}

export interface LoadDemoTransactionsOptions {
  sinceMs?: number;
  maxCount?: number;
}

/**
 * Loads pre-parsed demo transactions from EXPO_PUBLIC_DEMO_SMS_URL.
 * Required when EXPO_PUBLIC_SMS_SOURCE=demo.
 */
export async function loadDemoTransactions(
  options: LoadDemoTransactionsOptions = {}
): Promise<ParsedTransaction[]> {
  const remoteUrl = getDemoSmsUrl();
  if (!remoteUrl) {
    throw new Error(
      'Demo mode requires EXPO_PUBLIC_DEMO_SMS_URL pointing at a transaction dataset JSON.'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEMO_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(remoteUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Demo dataset returned HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    const list = extractTransactionList(payload);

    const sinceMs = options.sinceMs ?? 0;
    const maxCount = options.maxCount ?? 500;

    // Keep one user's history so the demo timeline stays coherent.
    const preferredUser = list.find((item) => isNonEmptyString(item.user_id))
      ?.user_id as string | undefined;
    const scoped = preferredUser
      ? list.filter((item) => item.user_id === preferredUser)
      : list;

    const mapped = scoped
      .map((item, index) => toParsedTransaction(item, index))
      .filter((item): item is ParsedTransaction => item !== null)
      .filter((item) => item.timestamp.getTime() >= sinceMs)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, maxCount);

    if (mapped.length === 0) {
      throw new Error('Demo dataset contained no usable transactions');
    }

    return mapped;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Demo dataset request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
