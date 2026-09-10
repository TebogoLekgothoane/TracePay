import type { FinancialAccount } from "../accounts/account.types";
import { hashText } from "./hash";
import {
  hasSignedDebitEvidence,
  resolveRowTransaction,
} from "./csv.validation";
import type {
  CandidateTransactionRow,
  DetectedColumnMapping,
  InvalidImportRow,
} from "./transaction-import.types";

function amountLabel(amount: number, type: "debit" | "credit"): string {
  const prefix = type === "debit" ? "-" : "+";
  return `${prefix}${amount.toFixed(2)}`;
}

function buildDedupeBase(args: {
  externalTransactionId: string | null;
  transactionDate: string;
  description: string;
  amount: number;
  currency: string;
  transactionType: "debit" | "credit";
}): string {
  if (args.externalTransactionId) {
    return `external:${args.externalTransactionId.trim().toLowerCase()}`;
  }

  const fingerprint = [
    args.transactionDate,
    args.description,
    args.amount.toFixed(2),
    args.currency,
    args.transactionType,
  ].join("|");

  return `fingerprint:${hashText(fingerprint)}`;
}

export function mapCsvRowsToCandidates(
  rows: string[][],
  mapping: DetectedColumnMapping,
  account: FinancialAccount,
): {
  candidates: CandidateTransactionRow[];
  invalidRows: InvalidImportRow[];
} {
  const candidates: CandidateTransactionRow[] = [];
  const invalidRows: InvalidImportRow[] = [];
  const hasNegativeEvidence = hasSignedDebitEvidence(rows, mapping);

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const resolved = resolveRowTransaction(row, mapping, account, hasNegativeEvidence);

    if (!resolved) {
      invalidRows.push({
        rowNumber,
        issues: [
          "This row is missing a valid date, description, amount, currency, or transaction type.",
        ],
        raw: row,
      });
      return;
    }

    const dedupeBase = buildDedupeBase({
      externalTransactionId: resolved.externalTransactionId,
      transactionDate: resolved.transactionDate.iso,
      description: resolved.description,
      amount: resolved.amount,
      currency: resolved.currency,
      transactionType: resolved.transactionType,
    });

    candidates.push({
      rowNumber,
      dedupeBase,
      externalTransactionId: resolved.externalTransactionId,
      insert: {
        account_id: account.id,
        transaction_date: resolved.transactionDate.iso,
        amount: resolved.amount.toFixed(2),
        currency: resolved.currency,
        description: resolved.description,
        raw_merchant_name: resolved.description,
        external_transaction_id: resolved.externalTransactionId,
        transaction_type: resolved.transactionType,
        payment_method: "unknown",
      },
      preview: {
        rowNumber,
        dateLabel: resolved.transactionDate.label,
        description: resolved.description,
        amountLabel: amountLabel(resolved.amount, resolved.transactionType),
        amountValue: resolved.amount.toFixed(2),
        currency: resolved.currency,
        transactionType: resolved.transactionType,
        debitCreditLabel: resolved.transactionType === "debit" ? "Debit" : "Credit",
        isDuplicate: false,
        issues: [],
      },
    });
  });

  return { candidates, invalidRows };
}

export function buildDedupeKey(accountId: string, dedupeBase: string): string {
  return hashText(`${accountId}|${dedupeBase}`);
}
