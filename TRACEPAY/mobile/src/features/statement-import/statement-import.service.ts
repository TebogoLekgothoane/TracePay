import type { DocumentPickerAsset } from "expo-document-picker";
import * as Crypto from "expo-crypto";

import { requireAccountForImport } from "../accounts/account.service";
import type { FinancialAccount } from "../accounts/account.types";
import { getPdfProcessorBaseUrl } from "../../constants/config";
import { getSupabase } from "../../lib/supabase";
import { buildTransactionDedupeKey } from "../transactions/transaction.dedupe";
import { hashStatementContent, readPdfBytes } from "../transactions/statement-file";
import {
  STATEMENT_IMPORT_STAGE_RATIO,
  type StatementImportProgress,
  type StatementImportStage,
} from "./statement-import.progress";
import { requireValidExtractedTransactions } from "./statement-import.validation";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const PDF_PROCESSOR_TIMEOUT_MS = 300_000;

export type { StatementImportProgress, StatementImportStage };

export type ExtractedTransaction = {
  date: string;
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
  statement: {
    bank: string | null;
    accountNumberLast4: string | null;
    accountType: string | null;
    statementStartDate: string | null;
    statementEndDate: string | null;
    openingBalance: number | null;
    closingBalance: number | null;
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
};

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
): Promise<{ status: number; payload: ProcessorPreviewPayload }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, PDF_PROCESSOR_TIMEOUT_MS);

    request.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Could not reach the PDF processor."));
    };
    request.onabort = () => {
      clearTimeout(timeout);
      reject(
        new Error(
          timedOut
            ? "PDF processing timed out after 300 seconds. Check that the processor is running and reachable, then try again."
            : "PDF processing was cancelled.",
        ),
      );
    };
    request.onload = () => {
      clearTimeout(timeout);
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
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: "application/pdf",
    } as unknown as Blob);
    if (password?.trim()) {
      form.append("password", password);
    }

    request.open("POST", url);
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
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

async function failAndCleanup(
  statementId: string,
  filePath: string,
  message: string,
): Promise<never> {
  console.error("[TracePay][statement] cleanup_failed_import", {
    statementId,
    message,
  });
  const supabase = getSupabase();
  await supabase
    .from("statement_imports")
    .update({ status: "failed", error_message: message })
    .eq("id", statementId);
  await supabase.from("transactions").delete().eq("statement_id", statementId);
  await supabase.storage.from("statements").remove([filePath]);
  throw new Error(message);
}

async function assertStatementPeriodNotDuplicate(
  accountId: string,
  statementId: string,
  startDate: string | null,
  endDate: string | null,
): Promise<void> {
  if (!startDate || !endDate) {
    return;
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("statement_imports")
    .select("id, file_name, statement_start_date, statement_end_date")
    .eq("account_id", accountId)
    .eq("status", "processed")
    .eq("statement_start_date", startDate)
    .eq("statement_end_date", endDate)
    .neq("id", statementId)
    .maybeSingle();

  if (error) {
    throw new Error("Existing statements could not be checked for duplicates.");
  }
  if (data) {
    throw new Error(
      `A statement for ${startDate} to ${endDate} is already imported${
        typeof data.file_name === "string" ? ` as "${data.file_name}"` : ""
      }. Overlapping statements are allowed; this exact period is already saved.`,
    );
  }
}

async function loadCanonicalDedupeMap(
  userId: string,
  accountId: string,
): Promise<Map<string, string>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, dedupe_key")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("is_duplicate", false)
    .not("dedupe_key", "is", null);

  if (error) {
    throw new Error("Existing transactions could not be checked for duplicates.");
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (typeof row.dedupe_key === "string" && typeof row.id === "string") {
      map.set(row.dedupe_key, row.id);
    }
  }
  return map;
}

async function persistPreview(
  preview: PdfStatementPreview,
  account: FinancialAccount,
): Promise<{ inserted: number; duplicates: number }> {
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
  console.info("[TracePay][statement] connected_account_ready", {
    accountId: account.id,
    accountName: account.name,
  });

  await assertStatementPeriodNotDuplicate(
    account.id,
    preview.statementId,
    preview.statement.statementStartDate,
    preview.statement.statementEndDate,
  );

  const canonicalKeys = await loadCanonicalDedupeMap(userData.user.id, account.id);
  const categoryNames = [
    ...new Set(
      preview.transactions
        .map((transaction) => transaction.category_name)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const categoryIds = new Map<string, string>();
  if (categoryNames.length > 0) {
    const { data: categories, error: categoryError } = await supabase
      .from("categories")
      .select("id,name")
      .in("name", categoryNames);
    if (categoryError) throw new Error("Categories could not be loaded.");
    for (const category of categories ?? []) {
      if (typeof category.id === "string" && typeof category.name === "string") {
        categoryIds.set(category.name, category.id);
      }
    }
    const missingCategories = categoryNames.filter(
      (name) => !categoryIds.has(name),
    );
    if (missingCategories.length > 0) {
      throw new Error(
        `The categories could not be resolved: ${missingCategories.join(", ")}.`,
      );
    }
  }

  let duplicateCount = 0;
  const batchKeys = new Map(canonicalKeys);
  const rows = preview.transactions.map((transaction) => {
    const dedupeKey = buildTransactionDedupeKey(account.id, transaction);
    const duplicateOf = batchKeys.get(dedupeKey) ?? null;
    const isDuplicate = Boolean(duplicateOf);
    const rowId = Crypto.randomUUID();
    if (isDuplicate) {
      duplicateCount += 1;
    } else {
      batchKeys.set(dedupeKey, rowId);
    }
    return {
      id: rowId,
      user_id: userData.user.id,
      account_id: account.id,
      statement_id: preview.statementId,
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      balance: transaction.balance ?? null,
      currency: transaction.currency ?? null,
      source: "statement",
      dedupe_key: dedupeKey,
      is_duplicate: isDuplicate,
      duplicate_of: duplicateOf,
      category_id: transaction.category_name
        ? (categoryIds.get(transaction.category_name) ?? null)
        : null,
      category_source: "automatic",
      category_confidence: transaction.category_confidence ?? 0,
      category_rule: transaction.category_rule ?? null,
      categorized_at: transaction.category_name
        ? new Date().toISOString()
        : null,
      transaction_class: transaction.transaction_class ?? "unknown",
      classification_confidence: transaction.classification_confidence ?? 0,
      classification_reason: transaction.classification_reason ?? null,
      merchant_name: transaction.merchant_name ?? null,
      reference: transaction.reference ?? null,
      extraction_method: preview.extractionMethod,
    };
  });
  let { error } = await supabase.from("transactions").insert(rows);
  if (
    error &&
    /merchant_name|reference|extraction_method|transaction_class|classification_confidence|classification_reason/i.test(
      error.message ?? "",
    )
  ) {
    console.warn("[TracePay][statement] optional_columns_missing", {
      code: error.code ?? null,
    });
    const legacyRows = rows.map(
      ({
        transaction_class: _transactionClass,
        classification_confidence: _classificationConfidence,
        classification_reason: _classificationReason,
        merchant_name: _merchantName,
        reference: _reference,
        extraction_method: _extractionMethod,
        ...row
      }) => row,
    );
    ({ error } = await supabase.from("transactions").insert(legacyRows));
  }
  if (error) {
    console.error("[TracePay][statement] transaction_insert_failed", {
      code: error.code ?? null,
      message: error.message ?? "unknown",
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    throw new Error(
      `The extracted transactions could not be saved${error.code ? ` (${error.code})` : ""}.`,
    );
  }
  const databaseUpdates = rows.filter((row) => row.category_id).length;
  console.info("[CATEGORISATION] database_updates", {
    statementId: preview.statementId,
    databaseUpdates,
    unknownAfterAi: preview.transactions.filter(
      (transaction) =>
        !transaction.category_name &&
        (transaction.transaction_class ?? "unknown") === "unknown",
    ).length,
  });
  const statementUpdate = {
    account_id: account.id,
    status: "processed" as const,
    extraction_method: preview.extractionMethod,
    transaction_count: rows.length - duplicateCount,
    processed_at: new Date().toISOString(),
    closing_balance: preview.statement.closingBalance ?? preview.statementBalance.amount,
    opening_balance: preview.statement.openingBalance,
    statement_start_date: preview.statement.statementStartDate,
    statement_end_date:
      preview.statement.statementEndDate ?? preview.statementBalance.asOfDate,
    extracted_bank: preview.statement.bank,
    extracted_last4: preview.statement.accountNumberLast4,
    balance_as_of:
      preview.statement.statementEndDate ?? preview.statementBalance.asOfDate,
    balance_source: preview.statementBalance.source,
    balance_reconciliation: preview.balanceReconciliation,
    extraction_confidence: preview.confidence,
    rows_detected: preview.rowsDetected,
    rows_rejected: preview.rowsRejected,
  };
  let { error: updateError } = await supabase
    .from("statement_imports")
    .update(statementUpdate)
    .eq("id", preview.statementId);
  if (
    updateError &&
    /opening_balance|statement_start_date|statement_end_date|extracted_bank|extracted_last4/i.test(
      updateError.message ?? "",
    )
  ) {
    const {
      opening_balance: _opening,
      statement_start_date: _start,
      statement_end_date: _end,
      extracted_bank: _bank,
      extracted_last4: _last4,
      ...legacyUpdate
    } = statementUpdate;
    ({ error: updateError } = await supabase
      .from("statement_imports")
      .update(legacyUpdate)
      .eq("id", preview.statementId));
  }
  if (updateError) {
    if (updateError.code === "23505") {
      throw new Error(
        "A statement for this account and date range is already imported.",
      );
    }
    throw new Error("The statement could not be marked as processed.");
  }

  await supabase.rpc("link_internal_transfers").then(({ error: linkError }) => {
    if (linkError) {
      console.warn("[TracePay][statement] link_internal_transfers_skipped", {
        message: linkError.message,
      });
    }
  });

  console.info("[TracePay][statement] persist_completed", {
    statementId: preview.statementId,
    transactionCount: rows.length - duplicateCount,
    duplicateCount,
  });
  return {
    inserted: rows.length - duplicateCount,
    duplicates: duplicateCount,
  };
}

export async function preparePdfStatement(
  asset: DocumentPickerAsset,
  options: PreparePdfStatementOptions,
): Promise<PdfStatementPreview> {
  const onProgress = options.onProgress;
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

  const account = await requireAccountForImport(options.accountId);

  const id = options.resume?.statementId ?? Crypto.randomUUID();
  const filePath =
    options.resume?.filePath ?? `statements/${userData.user.id}/${id}.pdf`;
  const isResume = Boolean(options.resume?.statementId && options.resume.filePath);
  let recordCreated = isResume;
  try {
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
    );
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
    if (persistResult.duplicates > 0) {
      preview.warnings = [
        ...preview.warnings,
        `${persistResult.duplicates} overlapping transaction${persistResult.duplicates === 1 ? "" : "s"} were kept as duplicates and excluded from totals.`,
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
    if (isPdfPasswordChallenge(error)) {
      throw error;
    }
    console.error("[TracePay][statement] import_failed", {
      statementId: id,
      message: errorMessage(error, "PDF processing failed."),
    });
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
