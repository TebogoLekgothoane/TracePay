import type { FinancialAccount } from "../accounts/account.types";
import { TransactionImportError } from "./transaction-import.errors";
import type {
  CsvDateFormat,
  DetectedColumnMapping,
  TransactionDirection,
} from "./transaction-import.types";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

type ParsedAmount = {
  amount: number;
  explicitNegative: boolean;
};

function assertValidDateParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
}

function readMonth(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  return MONTHS[normalized] ?? null;
}

export function parseTransactionDate(
  raw: string,
  format: CsvDateFormat,
): { iso: string; label: string } | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  let year = 0;
  let month = 0;
  let day = 0;

  if (format === "ymd_numeric") {
    const match = value.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (!match) {
      return null;
    }
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }

  if (format === "dmy_numeric") {
    const match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!match) {
      return null;
    }
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  if (format === "mdy_numeric") {
    const match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!match) {
      return null;
    }
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  }

  if (format === "dmy_text") {
    const match = value.match(/^(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})$/i);
    if (!match) {
      return null;
    }
    day = Number(match[1]);
    month = readMonth(match[2]) ?? 0;
    year = Number(match[3]);
  }

  if (format === "mdy_text") {
    const match = value.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (!match) {
      return null;
    }
    month = readMonth(match[1]) ?? 0;
    day = Number(match[2]);
    year = Number(match[3]);
  }

  const iso = assertValidDateParts(year, month, day);
  if (!iso) {
    return null;
  }

  return {
    iso,
    label: new Intl.DateTimeFormat("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso)),
  };
}

function normalizeAmountText(raw: string): {
  value: string;
  explicitNegative: boolean;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const wrappedNegative = /^\(.*\)$/.test(trimmed);
  const trailingNegative = /-$/.test(trimmed);
  const leadingNegative = /^-/.test(trimmed);
  const explicitNegative = wrappedNegative || trailingNegative || leadingNegative;

  const cleaned = trimmed
    .replace(/[()]/g, "")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .replace(/[A-Za-z]/g, "")
    .replace(/[R$£€¥]/g, "")
    .replace(/\s+/g, "");

  if (!/[0-9]/.test(cleaned)) {
    return null;
  }

  return { value: cleaned, explicitNegative };
}

export function parseAmount(raw: string): ParsedAmount | null {
  const normalized = normalizeAmountText(raw);
  if (!normalized) {
    return null;
  }

  let amountValue = normalized.value;
  const lastComma = amountValue.lastIndexOf(",");
  const lastDot = amountValue.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    amountValue = amountValue.split(thousandsSeparator).join("");
    amountValue = amountValue.replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    const decimals = amountValue.length - lastComma - 1;
    amountValue =
      decimals === 2
        ? amountValue.replace(",", ".")
        : amountValue.split(",").join("");
  } else if (lastDot >= 0) {
    const decimals = amountValue.length - lastDot - 1;
    amountValue =
      decimals === 2
        ? amountValue
        : amountValue.split(".").join("");
  }

  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return {
    amount,
    explicitNegative: normalized.explicitNegative,
  };
}

function parseTypeValue(raw: string): TransactionDirection | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    ["debit", "dr", "withdrawal", "expense", "outflow", "payment"].includes(normalized)
  ) {
    return "debit";
  }

  if (
    ["credit", "cr", "deposit", "income", "inflow", "refund"].includes(normalized)
  ) {
    return "credit";
  }

  return null;
}

export function validateAccount(account: FinancialAccount | null | undefined): FinancialAccount {
  if (!account?.id) {
    throw new TransactionImportError(
      "invalid_account",
      "Choose one of your linked accounts before importing.",
    );
  }

  return account;
}

export function readCurrency(raw: string | undefined, fallback: string): string | null {
  const value = raw?.trim().toUpperCase() ?? "";
  if (!value) {
    return fallback;
  }

  return /^[A-Z]{3}$/.test(value) ? value : null;
}

export function resolveRowTransaction(
  row: string[],
  mapping: DetectedColumnMapping,
  account: FinancialAccount,
  hasSignedAmountEvidence: boolean,
): {
  transactionDate: { iso: string; label: string };
  description: string;
  amount: number;
  currency: string;
  transactionType: TransactionDirection;
  externalTransactionId: string | null;
} | null {
  const transactionDate = parseTransactionDate(
    row[mapping.dateIndex] ?? "",
    mapping.dateFormat,
  );
  if (!transactionDate) {
    return null;
  }

  const description = (row[mapping.descriptionIndex] ?? "").trim();
  if (!description) {
    return null;
  }

  const currency = readCurrency(
    mapping.currencyIndex === null ? undefined : row[mapping.currencyIndex],
    account.currency,
  );
  if (!currency) {
    return null;
  }

  const externalTransactionId =
    mapping.externalIdIndex === null
      ? null
      : ((row[mapping.externalIdIndex] ?? "").trim() || null);

  if (mapping.amountMode === "debit_credit_columns") {
    const debit = mapping.debitIndex === null ? null : parseAmount(row[mapping.debitIndex] ?? "");
    const credit =
      mapping.creditIndex === null ? null : parseAmount(row[mapping.creditIndex] ?? "");

    if (debit && credit) {
      return null;
    }

    if (!debit && !credit) {
      return null;
    }

    return {
      transactionDate,
      description,
      amount: Number((debit?.amount ?? credit?.amount ?? 0).toFixed(2)),
      currency,
      transactionType: debit ? "debit" : "credit",
      externalTransactionId,
    };
  }

  const parsedAmount = mapping.amountIndex === null ? null : parseAmount(row[mapping.amountIndex] ?? "");
  if (!parsedAmount) {
    return null;
  }

  const parsedType =
    mapping.typeIndex === null ? null : parseTypeValue(row[mapping.typeIndex] ?? "");

  let transactionType: TransactionDirection | null = null;
  if (parsedAmount.explicitNegative) {
    transactionType = "debit";
  } else if (parsedType) {
    transactionType = parsedType;
  } else if (hasSignedAmountEvidence) {
    transactionType = "credit";
  }

  if (!transactionType) {
    return null;
  }

  return {
    transactionDate,
    description,
    amount: Number(parsedAmount.amount.toFixed(2)),
    currency,
    transactionType,
    externalTransactionId,
  };
}

export function hasSignedDebitEvidence(
  rows: string[][],
  mapping: DetectedColumnMapping,
): boolean {
  if (mapping.amountMode !== "signed_amount" || mapping.amountIndex === null) {
    return false;
  }

  const amountIndex = mapping.amountIndex;
  return rows.some((row) => {
    const parsed = parseAmount(row[amountIndex] ?? "");
    return parsed?.explicitNegative === true;
  });
}
