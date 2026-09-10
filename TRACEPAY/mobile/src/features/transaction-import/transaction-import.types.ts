import type { FinancialAccount } from "../accounts/account.types";

export type CsvDelimiter = "," | ";" | "\t" | "|";

export type CsvDateFormat =
  | "ymd_numeric"
  | "dmy_numeric"
  | "mdy_numeric"
  | "dmy_text"
  | "mdy_text";

export type TransactionDirection = "debit" | "credit";

export type CsvAmountMode = "signed_amount" | "debit_credit_columns";

export type DetectedColumnMapping = {
  headers: string[];
  delimiter: CsvDelimiter;
  dateFormat: CsvDateFormat;
  amountMode: CsvAmountMode;
  dateIndex: number;
  descriptionIndex: number;
  amountIndex: number | null;
  debitIndex: number | null;
  creditIndex: number | null;
  currencyIndex: number | null;
  typeIndex: number | null;
  externalIdIndex: number | null;
};

export type ParsedCsvFile = {
  delimiter: CsvDelimiter;
  headers: string[];
  rows: string[][];
};

export type CanonicalTransactionInsert = {
  account_id: string;
  transaction_date: string;
  amount: string;
  currency: string;
  description: string;
  raw_merchant_name: string;
  external_transaction_id: string | null;
  transaction_type: TransactionDirection;
  payment_method: "unknown";
  dedupe_key: string;
};

export type PreviewTransactionRow = {
  rowNumber: number;
  dateLabel: string;
  description: string;
  amountLabel: string;
  amountValue: string;
  currency: string;
  transactionType: TransactionDirection;
  debitCreditLabel: "Debit" | "Credit";
  isDuplicate: boolean;
  issues: string[];
};

export type InvalidImportRow = {
  rowNumber: number;
  issues: string[];
  raw: string[];
};

export type CandidateTransactionRow = {
  rowNumber: number;
  dedupeBase: string;
  externalTransactionId: string | null;
  insert: Omit<CanonicalTransactionInsert, "dedupe_key">;
  preview: PreviewTransactionRow;
};

export type CsvImportPreview = {
  account: Pick<FinancialAccount, "id" | "name" | "currency">;
  fileName: string;
  fileSha256: string;
  mapping: DetectedColumnMapping;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  exactFileDuplicate: boolean;
  attentionMessages: string[];
  previewRows: PreviewTransactionRow[];
  invalidRowDetails: InvalidImportRow[];
  candidateRows: CandidateTransactionRow[];
};

export type CsvImportSuccess = {
  importId: string;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  totalRows: number;
  accountName: string;
  fileName: string;
};
