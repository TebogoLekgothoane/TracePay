/**
 * Client-side validation aligned with TRACEPAY/backend/pdf_processor/models.py Transaction.
 * Rejects unsafe/malformed processor payloads before Supabase insert.
 */

import type { ExtractedTransaction } from "./statement-import.service";

const TRANSACTION_CLASSES = new Set([
  "spending",
  "income",
  "internal_transfer",
  "person_to_person",
  "savings",
  "investment",
  "bank_fee",
  "unknown",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asAmount(value: unknown): number | null {
  if (isFiniteNumber(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strict ISO calendar date. The processor always sends YYYY-MM-DD, so anything
 * else (or an impossible day such as 2026-02-30, which Date.parse would
 * quietly roll over) is rejected instead of being reinterpreted.
 */
function asDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  const match = ISO_DATE.exec(text);
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return text;
}

function asOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return asDate(value) ?? undefined;
}

const DATE_CONFIDENCES = new Set(["high", "medium", "low"]);

function asWarnings(value: unknown): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 20) {
    return null;
  }
  if (value.some((item) => typeof item !== "string" || item.length > 120)) {
    return null;
  }
  return value as string[];
}

function asTime(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^\d{2}:\d{2}(?::\d{2})?$/.test(value.trim())) {
    return null;
  }
  return value.trim();
}

function asConfidence(value: unknown, fallback = 0): number | null {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    return null;
  }
  return value;
}

export function parseExtractedTransaction(value: unknown): ExtractedTransaction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const date = asDate(row.date);
  const transactionTime = asTime(row.transaction_time);
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const amount = asAmount(row.amount);
  const type =
    row.type === "debit" || row.type === "credit"
      ? row.type
      : row.direction === "debit" || row.direction === "credit"
        ? row.direction
        : null;

  if (!date || description.length < 1 || description.length > 500 || amount === null) {
    return null;
  }
  if (row.transaction_time !== undefined && row.transaction_time !== null && transactionTime === null) {
    return null;
  }
  if (type !== "debit" && type !== "credit") {
    return null;
  }

  const rawBalance = row.balance ?? row.balance_after;
  const balance =
    rawBalance === undefined || rawBalance === null ? null : asAmount(rawBalance);
  if (rawBalance !== undefined && rawBalance !== null && balance === null) {
    return null;
  }

  // Date provenance from the extractor. Optional, but never silently coerced.
  const bookingDate = asOptionalDate(row.booking_date);
  const valueDate = asOptionalDate(row.value_date);
  const dateWarnings = asWarnings(row.date_warnings);
  const dateConfidence =
    row.date_confidence === undefined || row.date_confidence === null
      ? null
      : typeof row.date_confidence === "string" && DATE_CONFIDENCES.has(row.date_confidence)
        ? (row.date_confidence as "high" | "medium" | "low")
        : undefined;
  const sourceRow =
    row.source_row === undefined || row.source_row === null
      ? null
      : typeof row.source_row === "number" && Number.isInteger(row.source_row) && row.source_row >= 0
        ? row.source_row
        : undefined;
  if (
    bookingDate === undefined ||
    valueDate === undefined ||
    dateWarnings === null ||
    dateConfidence === undefined ||
    sourceRow === undefined
  ) {
    return null;
  }

  const categoryConfidence = asConfidence(row.category_confidence, 0);
  const classificationConfidence = asConfidence(row.classification_confidence, 0);
  if (categoryConfidence === null || classificationConfidence === null) {
    return null;
  }

  const transactionClass =
    typeof row.transaction_class === "string" ? row.transaction_class : "unknown";
  if (!TRANSACTION_CLASSES.has(transactionClass)) {
    return null;
  }

  const currency =
    row.currency === undefined || row.currency === null
      ? undefined
      : typeof row.currency === "string" && row.currency.trim().length > 0
        ? row.currency.trim()
        : null;
  if (currency === null) {
    return null;
  }

  return {
    date,
    transaction_time: transactionTime,
    description,
    amount,
    type,
    balance,
    currency,
    category_name:
      row.category_name === undefined || row.category_name === null
        ? null
        : typeof row.category_name === "string"
          ? row.category_name
          : null,
    category_confidence: categoryConfidence,
    category_rule:
      row.category_rule === undefined || row.category_rule === null
        ? null
        : typeof row.category_rule === "string"
          ? row.category_rule
          : null,
    transaction_class: transactionClass,
    classification_confidence: classificationConfidence,
    classification_reason:
      row.classification_reason === undefined || row.classification_reason === null
        ? null
        : typeof row.classification_reason === "string"
          ? row.classification_reason
          : null,
    merchant_name:
      row.merchant_name === undefined || row.merchant_name === null
        ? null
        : typeof row.merchant_name === "string"
          ? row.merchant_name
          : null,
    reference:
      row.reference === undefined || row.reference === null
        ? null
        : typeof row.reference === "string"
          ? row.reference.trim().slice(0, 80)
          : null,
    date_text:
      typeof row.date_text === "string" && row.date_text.trim().length > 0
        ? row.date_text.trim().slice(0, 40)
        : null,
    date_confidence: dateConfidence,
    date_warnings: dateWarnings,
    booking_date: bookingDate,
    value_date: valueDate,
    source_row: sourceRow,
  };
}

/** Validate processor transactions before persistence. Fails closed on empty/invalid batches. */
export function requireValidExtractedTransactions(values: unknown): ExtractedTransaction[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("The processor returned no valid transactions.");
  }

  const parsed = values.map(parseExtractedTransaction);
  if (parsed.some((row) => row === null)) {
    throw new Error("The processor returned invalid transaction data.");
  }

  return parsed as ExtractedTransaction[];
}
