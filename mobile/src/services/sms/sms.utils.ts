import { TransactionCategory } from './sms.types';
import { CATEGORY_KEYWORDS, CURRENCY_PATTERNS } from './banks.constants';

// ─── Deterministic ID ─────────────────────────────────────────────────────────
// Simple djb2 hash — no native crypto needed in RN

export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeTransactionId(smsId: string, body: string): string {
  return `tx_${hashString(smsId + body)}`;
}

// ─── Amount parsing ───────────────────────────────────────────────────────────

/**
 * Parses "R 1 234.56", "R1,234.56", "ZAR1234.56" → 1234.56
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw
    .replace(CURRENCY_PATTERNS, '')
    .replace(/\s/g, '')
    .replace(/,(?=\d{3})/g, '')   // remove thousands separators
    .trim();

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.abs(num);
}

// ─── Date parsing ────────────────────────────────────────────────────────────

/**
 * Parses common SA bank date formats into a Date.
 * Falls back to the SMS timestamp (dateMs) if no date found in body.
 */
export function parseDate(
  raw: string | undefined,
  fallbackMs: number
): Date {
  if (!raw) return new Date(fallbackMs);

  // dd/mm/yyyy or dd-mm-yyyy
  const dmyMatch = raw.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  // dd Mon yyyy  e.g. "12 Jun 2025"
  const strMatch = raw.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (strMatch) {
    return new Date(`${strMatch[2]} ${strMatch[1]} ${strMatch[3]}`);
  }

  // yyyy-mm-dd
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(raw);
  }

  return new Date(fallbackMs);
}

// ─── Category inference ───────────────────────────────────────────────────────

export function inferCategory(merchant?: string): TransactionCategory {
  if (!merchant) return 'other';

  const categories = Object.entries(CATEGORY_KEYWORDS) as Array<
    [TransactionCategory, RegExp]
  >;

  for (const [category, pattern] of categories) {
    if (category === 'other') continue;   // fallback, check last
    if (pattern.test(merchant)) return category;
  }

  return 'other';
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

export function scoreConfidence(
  hasAmount: boolean,
  hasMerchant: boolean,
  hasDate: boolean,
  hasBalance: boolean
): 'high' | 'medium' | 'low' {
  const score = [hasAmount, hasMerchant, hasDate, hasBalance].filter(Boolean).length;
  if (score >= 3) return 'high';
  if (score === 2) return 'medium';
  return 'low';
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

export function normaliseMerchant(raw: string): string {
  return raw
    .replace(/\s{2,}/g, ' ')
    .replace(/[*#]/g, '')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
} 