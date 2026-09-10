import { TransactionImportError } from "./transaction-import.errors";
import type {
  CsvAmountMode,
  CsvDateFormat,
  DetectedColumnMapping,
  ParsedCsvFile,
} from "./transaction-import.types";

type DateEvidence = {
  format: CsvDateFormat;
  score: number;
};

const DATE_ALIASES = [
  "date",
  "transaction date",
  "trans date",
  "posted date",
  "posting date",
  "value date",
  "effective date",
];

const DESCRIPTION_ALIASES = [
  "description",
  "transaction description",
  "details",
  "narrative",
  "narration",
  "reference",
  "merchant",
  "transaction details",
  "statement description",
];

const AMOUNT_ALIASES = [
  "amount",
  "transaction amount",
  "amount zar",
  "amount in account currency",
];

const DEBIT_ALIASES = ["debit", "withdrawal", "money out", "outflow", "debits"];
const CREDIT_ALIASES = ["credit", "deposit", "money in", "inflow", "credits"];
const CURRENCY_ALIASES = ["currency", "curr", "ccy"];
const TYPE_ALIASES = ["type", "transaction type", "debit credit", "dr cr", "dr/cr"];
const EXTERNAL_ID_ALIASES = [
  "transaction id",
  "transaction_id",
  "reference number",
  "transaction reference",
  "bank reference",
  "external transaction id",
];

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const PARTIAL_MATCH_BLOCKLIST = new Set(["date", "type", "curr", "ccy"]);

function findColumnIndex(headers: string[], aliases: readonly string[]): number | null {
  const normalized = headers.map(normalizeHeader);

  for (const alias of aliases) {
    const exactIndex = normalized.findIndex((header) => header === alias);
    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  for (const alias of aliases) {
    if (PARTIAL_MATCH_BLOCKLIST.has(alias)) {
      continue;
    }

    const partialIndex = normalized.findIndex((header) => header.includes(alias));
    if (partialIndex >= 0) {
      return partialIndex;
    }
  }

  return null;
}

function dateEvidence(value: string): DateEvidence | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(text)) {
    return { format: "ymd_numeric", score: 4 };
  }

  const numeric = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    if (first > 12 && second <= 12) {
      return { format: "dmy_numeric", score: 4 };
    }
    if (second > 12 && first <= 12) {
      return { format: "mdy_numeric", score: 4 };
    }
    return null;
  }

  if (/^\d{1,2}\s+[a-z]{3,9}\s+\d{4}$/i.test(text)) {
    return { format: "dmy_text", score: 4 };
  }

  if (/^[a-z]{3,9}\s+\d{1,2},?\s+\d{4}$/i.test(text)) {
    return { format: "mdy_text", score: 4 };
  }

  return null;
}

function inferDateFormat(rows: string[][], dateIndex: number): CsvDateFormat {
  const scores = new Map<CsvDateFormat, number>();

  for (const row of rows.slice(0, 50)) {
    const evidence = dateEvidence(row[dateIndex] ?? "");
    if (!evidence) {
      continue;
    }
    scores.set(evidence.format, (scores.get(evidence.format) ?? 0) + evidence.score);
  }

  if (scores.size === 0) {
    throw new TransactionImportError(
      "unsupported_columns",
      "Could not determine a supported transaction date format from this CSV.",
    );
  }

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const top = ranked[0];
  const runnerUp = ranked[1];

  if (!top) {
    throw new TransactionImportError(
      "unsupported_columns",
      "Could not determine a supported transaction date format from this CSV.",
    );
  }

  if (runnerUp && runnerUp[1] === top[1] && runnerUp[0] !== top[0]) {
    throw new TransactionImportError(
      "unsupported_columns",
      "This CSV uses an ambiguous date format. Please export a file with unambiguous dates such as YYYY-MM-DD or month names.",
    );
  }

  return top[0];
}

export function detectCsvColumns(parsed: ParsedCsvFile): DetectedColumnMapping {
  const dateIndex = findColumnIndex(parsed.headers, DATE_ALIASES);
  const descriptionIndex = findColumnIndex(parsed.headers, DESCRIPTION_ALIASES);
  const amountIndex = findColumnIndex(parsed.headers, AMOUNT_ALIASES);
  const debitIndex = findColumnIndex(parsed.headers, DEBIT_ALIASES);
  const creditIndex = findColumnIndex(parsed.headers, CREDIT_ALIASES);
  const currencyIndex = findColumnIndex(parsed.headers, CURRENCY_ALIASES);
  const typeIndex = findColumnIndex(parsed.headers, TYPE_ALIASES);
  const externalIdIndex = findColumnIndex(parsed.headers, EXTERNAL_ID_ALIASES);

  const unsupportedMessage =
    "We couldn't find transaction data in this CSV. Please upload a bank statement containing transaction dates, descriptions and amounts.";

  if (dateIndex === null || descriptionIndex === null) {
    throw new TransactionImportError("unsupported_columns", unsupportedMessage);
  }

  let amountMode: CsvAmountMode;
  if (amountIndex !== null) {
    amountMode = "signed_amount";
  } else if (debitIndex !== null || creditIndex !== null) {
    amountMode = "debit_credit_columns";
  } else {
    throw new TransactionImportError("unsupported_columns", unsupportedMessage);
  }

  return {
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    dateFormat: inferDateFormat(parsed.rows, dateIndex),
    amountMode,
    dateIndex,
    descriptionIndex,
    amountIndex,
    debitIndex,
    creditIndex,
    currencyIndex,
    typeIndex,
    externalIdIndex,
  };
}
