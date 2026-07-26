import type {
  ParsedTransaction,
  TransactionCategory,
  TransactionType,
} from '@/services/sms/sms.types';

export interface StoredTransaction {
  id: string;
  bank: string;
  type: TransactionType;
  amount: number;
  currency: string;
  merchant?: string;
  summary?: string;
  timestamp: string;
  category: TransactionCategory;
  parsedAt: string;
  confidence: ParsedTransaction['confidence'];
  logoDomain?: string;
}

const TRANSACTION_TYPES = new Set<TransactionType>([
  'debit',
  'credit',
  'reversal',
]);

const TRANSACTION_CATEGORIES = new Set<TransactionCategory>([
  'groceries',
  'fuel',
  'dining',
  'entertainment',
  'utilities',
  'transfer',
  'atm',
  'online',
  'medical',
  'other',
]);

const CONFIDENCE_LEVELS = new Set<ParsedTransaction['confidence']>([
  'high',
  'medium',
  'low',
]);

function sanitiseText(value: string | undefined, maxLength: number) {
  const sanitised = value?.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return sanitised ? sanitised.slice(0, maxLength) : undefined;
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Produces the minimum transaction record required by the app.
 * Raw SMS content, device SMS IDs, references, account fragments, and balances
 * intentionally never cross this persistence boundary.
 */
export function toStoredTransaction(
  transaction: ParsedTransaction
): StoredTransaction | null {
  if (
    !transaction.id ||
    transaction.id.length > 255 ||
    /[\u0000-\u001F\u007F]/.test(transaction.id) ||
    !Number.isFinite(transaction.amount) ||
    transaction.amount <= 0 ||
    !TRANSACTION_TYPES.has(transaction.type) ||
    !TRANSACTION_CATEGORIES.has(transaction.category) ||
    !CONFIDENCE_LEVELS.has(transaction.confidence) ||
    !isValidDate(transaction.timestamp) ||
    !isValidDate(transaction.parsedAt)
  ) {
    return null;
  }

  const bank = sanitiseText(transaction.bank, 64);
  const currency = sanitiseText(transaction.currency, 10)?.toUpperCase();
  if (!bank || !currency) return null;

  return {
    id: transaction.id,
    bank,
    type: transaction.type,
    amount: transaction.amount,
    currency,
    merchant: sanitiseText(transaction.merchant, 255),
    summary: sanitiseText(transaction.summary, 500),
    timestamp: transaction.timestamp.toISOString(),
    category: transaction.category,
    parsedAt: transaction.parsedAt.toISOString(),
    confidence: transaction.confidence,
    logoDomain: sanitiseText(transaction.logoDomain, 255),
  };
}

export function fromStoredTransaction(
  transaction: StoredTransaction
): ParsedTransaction {
  return {
    ...transaction,
    timestamp: new Date(transaction.timestamp),
    parsedAt: new Date(transaction.parsedAt),
    rawSmsId: '',
    rawBody: '',
  };
}
