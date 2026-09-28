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

function asDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
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
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const amount = asAmount(row.amount);
  const type = row.type;

  if (!date || description.length < 1 || description.length > 500 || amount === null) {
    return null;
  }
  if (type !== "debit" && type !== "credit") {
    return null;
  }

  const balance =
    row.balance === undefined || row.balance === null ? null : asAmount(row.balance);
  if (row.balance !== undefined && row.balance !== null && balance === null) {
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
