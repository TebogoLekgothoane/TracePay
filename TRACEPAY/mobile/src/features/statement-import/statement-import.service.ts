import type { DocumentPickerAsset } from "expo-document-picker";
import { invalidateQueries } from "../../lib/query-cache";
import * as Crypto from "expo-crypto";

import { listAccounts, requireAccountForImport } from "../accounts/account.service";
import type { FinancialAccount } from "../accounts/account.types";
import { getPdfProcessorBaseUrl } from "../../constants/config";
import { requestTransferReconciliation } from "../../api/statement-coverage.api";
import { getSupabase } from "../../lib/supabase";
import { hashStatementContent, readPdfBytes } from "../transactions/statement-file";
import {
  assertExtractedBankMatchesSelected,
  assertKnownStatementBankKey,
  normalizeStatementBankKey,
} from "./statement-bank";
import {
  accountMismatchMessage,
  ACCOUNT_UNCONFIRMED_NOTE,
  assessStatementAccount,
  belongsToOtherAccountMessage,
} from "./statement-account";
import {
  buildImportRpcRows,
  buildImportRpcStatement,
  describeImportFailure,
  summariseImportResult,
  type ImportRpcResult,
  type StatementImportSummary,
} from "./statement-import.persist";
import {
  isExpectedImportNotice,
  isNoTransactionsImportMessage,
  NO_ACTIVITY_IN_PERIOD_MESSAGE,
  NO_TRANSACTIONS_FOUND_MESSAGE,
} from "./statement-import.messages";
import {
  STATEMENT_IMPORT_STAGE_RATIO,
  type StatementImportProgress,
  type StatementImportStage,
} from "./statement-import.progress";
import {
  FindingReconciliationError,
  postFindingReconciliation,
  shouldReconcileSavedImport,
} from "./statement-import.reconciliation";
import { requireValidExtractedTransactions } from "./statement-import.validation";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const PDF_PROCESSOR_TIMEOUT_MS = 300_000;

export type { StatementImportProgress, StatementImportStage };

export type ExtractedTransaction = {
  date: string;
  transaction_time?: string | null;
  description: string;
  amount: number | string;
  type: "debit" | "credit";
  balance?: number | string | null;
  currency?: string;
  category_name?: string | null;
  category_confidence?: number;
  category_rule?: string | null;
  transaction_class?: string;
  classification_confidence?: number;
  classification_reason?: string | null;
  merchant_name?: string | null;
  reference?: string | null;
  /** The date exactly as the statement printed it, and how sure the parse is. */
  date_text?: string | null;
  date_confidence?: "high" | "medium" | "low" | null;
  date_warnings?: string[];
  booking_date?: string | null;
  value_date?: string | null;
  source_row?: number | null;
};

export type PdfStatementPreview = {
  filename: string;
  statementId: string;
  filePath: string;
  status: "valid" | "warning";
  extractionMethod: "text" | "table" | "ocr" | "ai" | "unknown";
  confidence: number;
  warnings: string[];
  transactions: ExtractedTransaction[];
  statementBalance: {
    amount: number | null;
    asOfDate: string | null;
    source: "closing_balance" | "running_balance" | "unavailable";
  };
  balanceReconciliation: "verified" | "not_available" | "mismatch";
  rowsDetected: number;
  rowsRejected: number;
  findingSummary?: {
    inserted: number;
    newFindings: number;
    updatedFindings: number;
  };
  /** What the import did to the consolidated history; set once saved. */
  importSummary?: StatementImportSummary;
  statement: {
    bank: string | null;
    accountNumberLast4: string | null;
    accountType: string | null;
    statementStartDate: string | null;
    statementEndDate: string | null;
    openingBalance: number | null;
    closingBalance: number | null;
    /** `declared`: printed on the statement. `inferred`: taken from the first and last transaction. */
    periodSource: "declared" | "inferred" | "unknown" | null;
    openingClosingReconciliation: "verified" | "not_available" | "mismatch" | null;
    reconciliationDifference: number | null;
  };
};

/** Expected unlock step — not an import failure. */
export class PdfPasswordChallengeError extends Error {
  readonly code: "password_required" | "invalid_password";
  readonly statementId: string;
  readonly filePath: string;

  constructor(
    code: "password_required" | "invalid_password",
    message: string,
    statementId: string,
    filePath: string,
  ) {
    super(message);
    this.name = "PdfPasswordChallengeError";
    this.code = code;
    this.statementId = statementId;
    this.filePath = filePath;
  }
}

export type PdfImportResume = {
  statementId: string;
  filePath: string;
};

export type PreparePdfStatementOptions = {
  accountId: string;
  password?: string;
  resume?: PdfImportResume | null;
  onProgress?: (progress: StatementImportProgress) => void;
  /** Abort in-flight upload/extract when the user cancels tracing. */
  signal?: AbortSignal;
};

export const PDF_IMPORT_CANCELLED_MESSAGE = "PDF processing was cancelled.";

export function isPdfImportCancelled(error: unknown): boolean {
  return (
    error instanceof Error &&
    /PDF processing was cancelled/i.test(error.message)
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error(PDF_IMPORT_CANCELLED_MESSAGE);
  }
}

function reportProgress(
  onProgress: PreparePdfStatementOptions["onProgress"],
  stage: StatementImportStage,
): void {
  onProgress?.({
    stage,
    ratio: STATEMENT_IMPORT_STAGE_RATIO[stage],
  });
}

export function isPdfPasswordChallenge(
  value: unknown,
): value is PdfPasswordChallengeError {
  return value instanceof PdfPasswordChallengeError;
}

export { FindingReconciliationError, isFindingReconciliationError } from "./statement-import.reconciliation";

type ProcessorPreviewPayload = {
  detail?: string;
  raw_extraction?: { extraction_method?: string };
  validation?: {
    status?: "valid" | "warning" | "failed";
    confidence?: number;
    warnings?: string[];
    errors?: string[];
    rows_detected?: number;
    rows_rejected?: number;
    balance_reconciliation?: "verified" | "not_available" | "mismatch";
    opening_closing_reconciliation?: "verified" | "not_available" | "mismatch";
    reconciliation_difference?: number | string | null;
    no_activity?: boolean;
  };
  statement_balance?: {
    amount?: number | string | null;
    as_of_date?: string | null;
    source?: "closing_balance" | "running_balance" | "unavailable";
  };
  statement?: {
    bank?: string | null;
    account_number_last4?: string | null;
    account_type?: string | null;
    statement_start_date?: string | null;
    statement_end_date?: string | null;
    opening_balance?: number | string | null;
    closing_balance?: number | string | null;
    balance_source?: "closing_balance" | "running_balance" | "unavailable";
    period_source?: "declared" | "inferred" | "unknown";
  };
  transactions?: ExtractedTransaction[];
};

function resolveStatementBalanceFromTransactions(
  transactions: ExtractedTransaction[],
): PdfStatementPreview["statementBalance"] {
  const withBalance = transactions.filter(
    (transaction) =>
      transaction.balance !== null &&
      transaction.balance !== undefined &&
      Number.isFinite(Number(transaction.balance)),
  );
  if (withBalance.length === 0) {
    return { amount: null, asOfDate: null, source: "unavailable" };
  }
  const latest = [...withBalance].sort((left, right) =>
    left.date < right.date ? 1 : left.date > right.date ? -1 : 0,
  )[0];
  return {
    amount: Number(latest.balance),
    asOfDate: latest.date,
    source: "running_balance",
  };
}

function readStatementBalance(
  payload: ProcessorPreviewPayload,
  transactions: ExtractedTransaction[],
): PdfStatementPreview["statementBalance"] {
  const raw = payload.statement_balance;
  if (raw && typeof raw === "object") {
    const amount =
      raw.amount === null || raw.amount === undefined
        ? null
        : Number(raw.amount);
    const source =
      raw.source === "closing_balance" ||
      raw.source === "running_balance" ||
      raw.source === "unavailable"
        ? raw.source
        : amount === null
          ? "unavailable"
          : "running_balance";
    if (source !== "unavailable" && amount !== null && Number.isFinite(amount)) {
      return {
        amount,
        asOfDate:
          typeof raw.as_of_date === "string" && raw.as_of_date.length > 0
            ? raw.as_of_date
            : null,
        source,
      };
    }
    if (source === "unavailable") {
      return { amount: null, asOfDate: null, source: "unavailable" };
    }
  }
  return resolveStatementBalanceFromTransactions(transactions);
}

function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function readOptionalDate(value: unknown): string | null {
  return typeof value === "string" && value.length >= 8 ? value : null;
}

function readExtractedStatement(
  payload: ProcessorPreviewPayload,
  statementBalance: PdfStatementPreview["statementBalance"],
): PdfStatementPreview["statement"] {
  const raw = payload.statement;
  const last4Raw =
    raw && typeof raw.account_number_last4 === "string"
      ? raw.account_number_last4.replace(/\D/g, "").slice(-4)
      : "";
  const closing =
    readOptionalNumber(raw?.closing_balance) ?? statementBalance.amount;
  return {
    bank:
      raw && typeof raw.bank === "string" && raw.bank.trim().length > 0
        ? raw.bank.trim()
        : null,
    accountNumberLast4: last4Raw.length === 4 ? last4Raw : null,
    accountType:
      raw && typeof raw.account_type === "string" && raw.account_type.length > 0
        ? raw.account_type
        : null,
    statementStartDate: readOptionalDate(raw?.statement_start_date),
    statementEndDate:
      readOptionalDate(raw?.statement_end_date) ?? statementBalance.asOfDate,
    openingBalance: readOptionalNumber(raw?.opening_balance),
    closingBalance: closing,
    periodSource:
      raw?.period_source === "declared" ||
      raw?.period_source === "inferred" ||
      raw?.period_source === "unknown"
        ? raw.period_source
        : null,
    openingClosingReconciliation:
      payload.validation?.opening_closing_reconciliation === "verified" ||
      payload.validation?.opening_closing_reconciliation === "mismatch" ||
      payload.validation?.opening_closing_reconciliation === "not_available"
        ? payload.validation.opening_closing_reconciliation
        : null,
    reconciliationDifference: readOptionalNumber(payload.validation?.reconciliation_difference),
  };
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
}

function parseProcessorPayload(text: string): ProcessorPreviewPayload {
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as ProcessorPreviewPayload;
  } catch {
    throw new Error("The PDF processor returned an invalid response.");
  }
}

/**
 * Expo's fetch cannot encode React Native `{ uri }` FormData parts, and RN
 * cannot construct Blobs from ArrayBuffer. XMLHttpRequest uses native
 * multipart encoding from the picked file URI.
 */
function postPdfToProcessor(
  url: string,
  accessToken: string,
  file: { uri: string; name: string },
  password: string | undefined,
  signal?: AbortSignal,
): Promise<{ status: number; payload: ProcessorPreviewPayload }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(PDF_IMPORT_CANCELLED_MESSAGE));
      return;
    }

    const request = new XMLHttpRequest();
    let timedOut = false;
    let userCancelled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, PDF_PROCESSOR_TIMEOUT_MS);

    const onSignalAbort = () => {
      userCancelled = true;
      request.abort();
    };
    signal?.addEventListener("abort", onSignalAbort, { once: true });

    const clearListeners = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onSignalAbort);
    };

    request.onerror = () => {
      clearListeners();
      reject(new Error("Could not reach the PDF processor."));
    };
    request.onabort = () => {
      clearListeners();
      reject(
        new Error(
          timedOut && !userCancelled
            ? "PDF processing timed out after 300 seconds. Check that the processor is running and reachable, then try again."
            : PDF_IMPORT_CANCELLED_MESSAGE,
        ),
      );
    };
    request.onload = () => {
      clearListeners();
      try {
        resolve({
          status: request.status,
          payload: parseProcessorPayload(request.responseText ?? ""),
        });
      } catch (error) {
        reject(error);
      }
    };

    const form = new FormData();
    const trimmedPassword = password?.trim() ?? "";
    // Append password before the file — some Android FormData builds drop
    // trailing string parts after a { uri } file part.
    if (trimmedPassword) {
      form.append("password", trimmedPassword);
    }
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: "application/pdf",
    } as unknown as Blob);

    request.open("POST", url);
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    if (trimmedPassword) {
      request.setRequestHeader("X-TracePay-Pdf-Password", trimmedPassword);
    }
    request.send(form);
  });
}

function passwordChallengeFromDetail(
  detail: string | undefined,
  statementId: string,
  filePath: string,
): PdfPasswordChallengeError | null {
  const text = detail?.trim() ?? "";
  if (!text) {
    return null;
  }
  if (/password protected/i.test(text)) {
    return new PdfPasswordChallengeError(
      "password_required",
      "This PDF is password protected. Enter the password to continue.",
      statementId,
      filePath,
    );
  }
  if (/password is incorrect/i.test(text)) {
    return new PdfPasswordChallengeError(
      "invalid_password",
      "The PDF password is incorrect. Please try again.",
      statementId,
      filePath,
    );
  }
  return null;
}

function isEmptyStatementOutcome(message: string): boolean {
  return isNoTransactionsImportMessage(message);
}

async function failAndCleanup(
  statementId: string,
  filePath: string,
  message: string,
): Promise<never> {
  const userMessage = isEmptyStatementOutcome(message)
    ? NO_TRANSACTIONS_FOUND_MESSAGE
    : message;
  if (isExpectedImportNotice(userMessage)) {
    console.info("[TracePay][statement] import_notice", {
      statementId,
      message: userMessage,
    });
  } else {
    console.error("[TracePay][statement] cleanup_failed_import", {
      statementId,
      message: userMessage,
    });
  }
  const supabase = getSupabase();
  await supabase
    .from("statement_imports")
    .update({ status: "failed", error_message: userMessage })
    .eq("id", statementId);
  await supabase.from("transactions").delete().eq("statement_id", statementId);
  await supabase.storage.from("statements").remove([filePath]);
  throw new Error(userMessage);
}

/**
 * Releases only abandoned attempts for this account. It must not touch other
 * in-flight imports: several statements can be processed in one session.
 */
async function releaseStaleAttempts(accountId: string, keepId: string | null): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("release_stale_statement_attempts", {
    p_account_id: accountId,
    p_keep_id: keepId,
  });
  if (error) {
    console.warn("[TracePay][statement] release_stale_attempts_failed", {
      message: error.message,
    });
  }
}

async function loadCategoryIds(names: string[]): Promise<Map<string, string>> {
  const categoryIds = new Map<string, string>();
  if (names.length === 0) return categoryIds;
  const { data: categories, error: categoryError } = await getSupabase()
    .from("categories")
    .select("id,name")
    .in("name", names);
  if (categoryError) throw new Error("Categories could not be loaded.");
  for (const category of categories ?? []) {
    if (typeof category.id === "string" && typeof category.name === "string") {
      categoryIds.set(category.name, category.id);
    }
  }
  const missing = names.filter((name) => !categoryIds.has(name));
  if (missing.length > 0) {
    throw new Error(`The categories could not be resolved: ${missing.join(", ")}.`);
  }
  return categoryIds;
}

const FINDING_REGISTRY_TIMEOUT_MS = 60_000;

async function currentAccessToken(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return "";
  }
  return data.session.access_token;
}

export async function retryFindingReconciliation(
  statementImportId: string,
): Promise<{ newFindings: number; updatedFindings: number }> {
  return postFindingReconciliation({
    statementImportId,
    accessToken: await currentAccessToken(),
    baseUrl: getPdfProcessorBaseUrl(),
    timeoutMs: FINDING_REGISTRY_TIMEOUT_MS,
  });
}

type PersistResult = {
  /** New transactions added to the consolidated history. */
  inserted: number;
  /** Rows already imported from another statement or an earlier run. */
  duplicates: number;
  summary: StatementImportSummary;
  accountNote: string | null;
  newFindings: number;
  updatedFindings: number;
};

/**
 * Compare the statement's own account identity with the account the user
 * chose. A disagreement stops the import: saving someone's transactions under
 * the wrong account would corrupt both accounts' coverage and totals.
 */
async function confirmStatementAccount(
  account: FinancialAccount,
  preview: PdfStatementPreview,
): Promise<{ adoptLastFour: string | null; note: string | null }> {
  const accounts = await listAccounts();
  const verdict = assessStatementAccount(
    account,
    accounts,
    preview.statement.accountNumberLast4,
  );
  switch (verdict.status) {
    case "mismatch":
      throw new Error(
        accountMismatchMessage(verdict.accountLastFour, verdict.statementLastFour),
      );
    case "belongs_to_other_account":
      throw new Error(
        belongsToOtherAccountMessage(
          preview.statement.accountNumberLast4 ?? "",
          verdict.accountName,
        ),
      );
    case "adopt_last4":
      return { adoptLastFour: verdict.lastFour, note: null };
    case "unconfirmed":
      return { adoptLastFour: null, note: ACCOUNT_UNCONFIRMED_NOTE };
    default:
      return { adoptLastFour: null, note: null };
  }
}

async function persistPreview(
  preview: PdfStatementPreview,
  account: FinancialAccount,
): Promise<PersistResult> {
  console.info("[TracePay][statement] persist_started", {
    statementId: preview.statementId,
    transactionCount: preview.transactions.length,
    status: preview.status,
  });
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Sign in before saving transactions.");
  }

  assertExtractedBankMatchesSelected(account.institution, preview.statement.bank);
  const accountCheck = await confirmStatementAccount(account, preview);

  const categoryIds = await loadCategoryIds([
    ...new Set(
      preview.transactions
        .map((transaction) => transaction.category_name)
        .filter((name): name is string => Boolean(name)),
    ),
  ]);

  // One transaction: dedupe against the user's whole history, insert, and mark
  // the statement processed. The database serialises imports per account, so
  // two uploads cannot both decide the same row is new.
  const { data, error } = await supabase.rpc("import_statement_transactions", {
    p_statement_id: preview.statementId,
    p_rows: buildImportRpcRows(preview.transactions, categoryIds, preview.extractionMethod),
    p_statement: buildImportRpcStatement(preview),
    p_replace: false,
  });
  if (error) {
    console.error("[TracePay][statement] transaction_insert_failed", {
      code: error.code ?? null,
      message: error.message ?? "unknown",
    });
    throw new Error(describeImportFailure(error));
  }
  const result = data as ImportRpcResult;
  // New transactions: every cached chart and list must refresh on its next visit.
  invalidateQueries();
  const summary = summariseImportResult(result);

  if (accountCheck.adoptLastFour) {
    // The account now has a verified identity; later statements are checked against it.
    const { error: adoptError } = await supabase
      .from("accounts")
      .update({ last_four_digits: accountCheck.adoptLastFour })
      .eq("id", account.id);
    if (adoptError) {
      console.warn("[TracePay][statement] account_last4_not_saved", {
        code: adoptError.code ?? null,
      });
    }
  }

  // Link own-account transfers and refunds now that this statement is in.
  // Evidence-based and best effort; analysis re-derives the same decision.
  await requestTransferReconciliation();

  console.info("[TracePay][statement] persist_completed", {
    statementId: preview.statementId,
    newTransactions: summary.newTransactions,
    overlapDuplicates: summary.overlapDuplicates,
    possibleDuplicates: summary.possibleDuplicates,
  });
  let newFindings = 0;
  let updatedFindings = 0;
  if (shouldReconcileSavedImport("processed", summary.newTransactions)) {
    try {
      const counts = await retryFindingReconciliation(preview.statementId);
      newFindings = counts.newFindings;
      updatedFindings = counts.updatedFindings;
    } catch (reconcileError) {
      const message =
        reconcileError instanceof FindingReconciliationError
          ? reconcileError.message
          : "Finding reconciliation could not finish. Your statement is saved. Try again.";
      throw new FindingReconciliationError(
        preview.statementId,
        message,
        summary.newTransactions,
      );
    }
  }
  return {
    inserted: summary.newTransactions,
    duplicates: summary.overlapDuplicates,
    summary,
    accountNote: accountCheck.note,
    newFindings,
    updatedFindings,
  };
}

export async function preparePdfStatement(
  asset: DocumentPickerAsset,
  options: PreparePdfStatementOptions,
): Promise<PdfStatementPreview> {
  const onProgress = options.onProgress;
  const signal = options.signal;
  const name = asset.name || "statement.pdf";
  console.info("[TracePay][statement] import_started", {
    filename: name,
    sizeBytes: asset.size ?? null,
    mimeType: asset.mimeType ?? null,
    resumeStatementId: options.resume?.statementId ?? null,
    accountId: options.accountId,
  });
  if (!name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Choose a PDF bank statement.");
  }
  if (asset.mimeType && asset.mimeType !== "application/pdf") {
    throw new Error("The selected file is not a PDF.");
  }
  if (asset.size && asset.size > MAX_FILE_SIZE) {
    throw new Error("PDF statements must be smaller than 20 MB.");
  }

  throwIfAborted(signal);
  reportProgress(onProgress, "preparing");

  const supabase = getSupabase();
  const [
    { data: userData, error: userError },
    { data: sessionData, error: sessionError },
  ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
  if (
    userError ||
    sessionError ||
    !userData.user ||
    !sessionData.session?.access_token
  ) {
    throw new Error("Sign in before importing a statement.");
  }

  let account = await requireAccountForImport(options.accountId);

  const id = options.resume?.statementId ?? Crypto.randomUUID();
  const filePath =
    options.resume?.filePath ?? `statements/${userData.user.id}/${id}.pdf`;
  const isResume = Boolean(options.resume?.statementId && options.resume.filePath);
  let recordCreated = isResume;
  try {
    // Resume must persist against the statement's original account or RLS rejects inserts.
    if (isResume && options.resume) {
      const { data: existingStatement, error: resumeLookupError } = await supabase
        .from("statement_imports")
        .select("account_id")
        .eq("id", options.resume.statementId)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (resumeLookupError) {
        throw new Error("Could not resume this statement import.");
      }
      const resumeAccountId =
        typeof existingStatement?.account_id === "string"
          ? existingStatement.account_id
          : null;
      if (!resumeAccountId) {
        throw new Error("This statement import is no longer available. Choose the PDF again.");
      }
      if (resumeAccountId !== account.id) {
        account = await requireAccountForImport(resumeAccountId);
        console.info("[TracePay][statement] resume_account_rebound", {
          statementId: options.resume.statementId,
          accountId: account.id,
        });
      }
    }

    // The bank must be known so the statement can be matched to the right
    // account, but a bank no longer limits how many statements may be added.
    const bankKey = assertKnownStatementBankKey(account.institution);
    await releaseStaleAttempts(account.id, isResume ? id : null);

    const fileBytes = await readPdfBytes(asset.uri);
    const fileSize = asset.size ?? fileBytes.byteLength;
    if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      throw new Error("PDF statements must be between 1 byte and 20 MB.");
    }
    const contentHash = await hashStatementContent(fileBytes);

    if (!isResume) {
      const { data: existingImport } = await supabase
        .from("statement_imports")
        .select("file_name")
        .eq("user_id", userData.user.id)
        .eq("content_hash", contentHash)
        .eq("status", "processed")
        .maybeSingle();
      if (existingImport?.file_name) {
        throw new Error(
          `This statement file was already imported as "${existingImport.file_name}".`,
        );
      }
    }

    if (!isResume) {
      throwIfAborted(signal);
      reportProgress(onProgress, "uploading");
      const { error: uploadError } = await supabase.storage
        .from("statements")
        .upload(filePath, fileBytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) {
        throw new Error("The statement could not be uploaded securely.");
      }
      throwIfAborted(signal);
      console.info("[TracePay][statement] storage_upload_completed", {
        statementId: id,
        sizeBytes: fileSize,
      });
      const { error: importError } = await supabase
        .from("statement_imports")
        .insert({
          id,
          user_id: userData.user.id,
          account_id: account.id,
          file_path: filePath,
          file_name: name,
          file_size: fileSize,
          content_hash: contentHash,
          format: "pdf",
          status: "uploaded",
          bank_key: bankKey,
        });
      if (importError) {
        await supabase.storage.from("statements").remove([filePath]);
        throw new Error("The statement record could not be created.");
      }
      recordCreated = true;
    } else {
      console.info("[TracePay][statement] resume_existing_import", {
        statementId: id,
      });
    }

    const { error: processingError } = await supabase
      .from("statement_imports")
      .update({ status: "processing", error_message: null })
      .eq("id", id);
    if (processingError) {
      throw new Error("The statement could not be marked as processing.");
    }
    console.info("[TracePay][statement] processing_status_updated", {
      statementId: id,
      status: "processing",
    });

    const processorUrl = getPdfProcessorBaseUrl();
    if (!processorUrl) {
      return await failAndCleanup(
        id,
        filePath,
        "The PDF processor is not configured yet.",
      );
    }
    throwIfAborted(signal);
    reportProgress(onProgress, "extracting");
    console.info("[TracePay][statement] processor_request_started", {
      statementId: id,
      processorUrl,
    });
    const { status: httpStatus, payload } = await postPdfToProcessor(
      `${processorUrl}/extraction/preview`,
      sessionData.session.access_token,
      { uri: asset.uri, name },
      options.password,
      signal,
    );
    throwIfAborted(signal);
    const validation = payload.validation;
    console.info("[TracePay][statement] processor_request_completed", {
      statementId: id,
      httpStatus,
      extractionMethod:
        payload.raw_extraction?.extraction_method ?? "unknown",
      validationStatus: validation?.status ?? "missing",
      transactionCount: payload.transactions?.length ?? 0,
      confidence: validation?.confidence ?? null,
    });

    const passwordChallenge = passwordChallengeFromDetail(
      payload.detail,
      id,
      filePath,
    );
    if (passwordChallenge) {
      console.info("[TracePay][statement] password_challenge", {
        statementId: id,
        code: passwordChallenge.code,
      });
      await supabase
        .from("statement_imports")
        .update({
          status: "uploaded",
          error_message: null,
        })
        .eq("id", id);
      throw passwordChallenge;
    }

    if (httpStatus >= 200 && httpStatus < 300 && validation?.no_activity) {
      // Nothing to save; keeping the import would also block a later
      // statement for the same period as a duplicate.
      return await failAndCleanup(id, filePath, NO_ACTIVITY_IN_PERIOD_MESSAGE);
    }

    if (
      httpStatus < 200 ||
      httpStatus >= 300 ||
      validation?.status === "failed" ||
      !payload.transactions ||
      !validation
    ) {
      return await failAndCleanup(
        id,
        filePath,
        payload.detail ??
          validation?.errors?.join(" ") ??
          "PDF extraction failed.",
      );
    }

    let transactions;
    try {
      transactions = requireValidExtractedTransactions(payload.transactions);
    } catch (validationError) {
      return await failAndCleanup(
        id,
        filePath,
        errorMessage(
          validationError,
          "PDF extraction returned invalid transactions.",
        ),
      );
    }

    const statementBalance = readStatementBalance(payload, transactions);
    const statement = readExtractedStatement(payload, statementBalance);
    const preview: PdfStatementPreview = {
      filename: name,
      statementId: id,
      filePath,
      status: validation.status === "warning" ? "warning" : "valid",
      extractionMethod: (payload.raw_extraction?.extraction_method ??
        "unknown") as PdfStatementPreview["extractionMethod"],
      confidence: validation.confidence ?? 0,
      warnings: validation.warnings ?? [],
      transactions,
      statementBalance,
      statement,
      balanceReconciliation:
        validation.balance_reconciliation === "verified" ||
        validation.balance_reconciliation === "mismatch" ||
        validation.balance_reconciliation === "not_available"
          ? validation.balance_reconciliation
          : "not_available",
      rowsDetected: validation.rows_detected ?? transactions.length,
      rowsRejected: validation.rows_rejected ?? 0,
    };
    if (preview.status === "warning") {
      console.warn(
        "[TracePay][statement] saving_extracted_rows_with_warnings",
        {
          statementId: id,
          warningCount: preview.warnings.length,
          confidence: preview.confidence,
        },
      );
    }
    reportProgress(onProgress, "saving");
    const persistResult = await persistPreview(preview, account);
    preview.findingSummary = {
      inserted: persistResult.inserted,
      newFindings: persistResult.newFindings,
      updatedFindings: persistResult.updatedFindings,
    };
    preview.importSummary = persistResult.summary;
    if (persistResult.accountNote) {
      preview.warnings = [...preview.warnings, persistResult.accountNote];
    }
    if (persistResult.duplicates > 0) {
      preview.warnings = [
        ...preview.warnings,
        `${persistResult.duplicates} transaction${persistResult.duplicates === 1 ? " was" : "s were"} already in your history from an overlapping statement and ${persistResult.duplicates === 1 ? "is" : "are"} not counted twice.`,
      ];
    }
    if (persistResult.summary.possibleDuplicates > 0) {
      preview.warnings = [
        ...preview.warnings,
        `${persistResult.summary.possibleDuplicates} transaction${persistResult.summary.possibleDuplicates === 1 ? " might" : "s might"} also appear in another statement. ${persistResult.summary.possibleDuplicates === 1 ? "It was" : "They were"} kept and flagged for review.`,
      ];
    }
    console.info("[TracePay][statement] import_completed", {
      statementId: id,
      status: preview.status,
      inserted: persistResult.inserted,
      duplicates: persistResult.duplicates,
    });
    return preview;
  } catch (error) {
    if (isPdfPasswordChallenge(error) || error instanceof FindingReconciliationError) {
      throw error;
    }
    if (isPdfImportCancelled(error)) {
      console.info("[TracePay][statement] import_cancelled", {
        statementId: id,
      });
      if (recordCreated) {
        const supabase = getSupabase();
        await supabase
          .from("statement_imports")
          .update({
            status: "failed",
            error_message: PDF_IMPORT_CANCELLED_MESSAGE,
          })
          .eq("id", id);
        await supabase.from("transactions").delete().eq("statement_id", id);
        await supabase.storage.from("statements").remove([filePath]);
      }
      throw error;
    }
    const failedMessage = errorMessage(error, "PDF processing failed.");
    if (isExpectedImportNotice(failedMessage)) {
      console.info("[TracePay][statement] import_notice", {
        statementId: id,
        message: failedMessage,
      });
    } else {
      console.error("[TracePay][statement] import_failed", {
        statementId: id,
        message: failedMessage,
      });
    }
    if (recordCreated) {
      return await failAndCleanup(
        id,
        filePath,
        errorMessage(error, "PDF processing failed."),
      );
    }
    throw error;
  }
}
