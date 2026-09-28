import type { DocumentPickerAsset } from "expo-document-picker";
import * as Crypto from "expo-crypto";

import { ensureBankAccount } from "../accounts/account.service";
import { getPdfProcessorBaseUrl } from "../../constants/config";
import { getSupabase } from "../../lib/supabase";
import { requireValidExtractedTransactions } from "./statement-import.validation";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const PDF_PROCESSOR_TIMEOUT_MS = 300_000;

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
};

export type PdfStatementPreview = {
  filename: string;
  statementId: string;
  filePath: string;
  status: "valid" | "warning";
  extractionMethod: "text" | "table" | "ocr" | "unknown";
  confidence: number;
  warnings: string[];
  transactions: ExtractedTransaction[];
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

export function isPdfPasswordChallenge(
  value: unknown,
): value is PdfPasswordChallengeError {
  return value instanceof PdfPasswordChallengeError;
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
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

function accountLabelFromFilename(
  filename: string,
  preferredInstitution?: string | null,
): string {
  const preferred = preferredInstitution?.trim();
  if (preferred) return preferred.slice(0, 80);
  const label = filename
    .replace(/\.pdf$/i, "")
    .replace(/bankstatement/gi, "Bank Statement")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = label.split(" ").filter(Boolean);
  const bankIndex = words.findIndex((word) => word.toLowerCase() === "bank");
  if (bankIndex > 0) return `${words[0]} Bank`.slice(0, 80);
  if (words[0]?.toLowerCase().endsWith("bank")) return words[0].slice(0, 80);
  return (words[0] || "Imported bank").slice(0, 80);
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

async function persistPreview(
  preview: PdfStatementPreview,
  preferredInstitution?: string | null,
): Promise<void> {
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
  const account = await ensureBankAccount(
    accountLabelFromFilename(preview.filename, preferredInstitution),
  );
  console.info("[TracePay][statement] connected_account_ready", {
    accountId: account.id,
    accountName: account.name,
  });

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

  const rows = preview.transactions.map((transaction) => ({
    user_id: userData.user.id,
    statement_id: preview.statementId,
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    balance: transaction.balance ?? null,
    currency: transaction.currency ?? null,
    source: "pdf",
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
  }));
  let { error } = await supabase.from("transactions").insert(rows);
  if (
    error &&
    /transaction_class|classification_confidence|classification_reason/i.test(
      error.message ?? "",
    )
  ) {
    console.warn("[TracePay][statement] classification_columns_missing", {
      code: error.code ?? null,
    });
    const legacyRows = rows.map(
      ({
        transaction_class: _transactionClass,
        classification_confidence: _classificationConfidence,
        classification_reason: _classificationReason,
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
  const { error: updateError } = await supabase
    .from("statement_imports")
    .update({
      account_id: account.id,
      status: "processed",
      extraction_method: preview.extractionMethod,
      transaction_count: rows.length,
      processed_at: new Date().toISOString(),
    })
    .eq("id", preview.statementId);
  if (updateError) {
    throw new Error("The statement could not be marked as processed.");
  }
  console.info("[TracePay][statement] persist_completed", {
    statementId: preview.statementId,
    transactionCount: rows.length,
  });
}

export async function preparePdfStatement(
  asset: DocumentPickerAsset,
  preferredInstitution?: string | null,
  password?: string,
  resume?: PdfImportResume | null,
): Promise<PdfStatementPreview> {
  const name = asset.name || "statement.pdf";
  console.info("[TracePay][statement] import_started", {
    filename: name,
    sizeBytes: asset.size ?? null,
    mimeType: asset.mimeType ?? null,
    resumeStatementId: resume?.statementId ?? null,
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

  const id = resume?.statementId ?? Crypto.randomUUID();
  const filePath =
    resume?.filePath ?? `statements/${userData.user.id}/${id}.pdf`;
  const isResume = Boolean(resume?.statementId && resume.filePath);
  let recordCreated = isResume;
  try {
    const fileResponse = await fetch(asset.uri);
    if (!fileResponse.ok) {
      throw new Error("TracePay could not read the selected PDF.");
    }
    const file = await fileResponse.blob();
    const fileSize = asset.size ?? file.size;
    if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      throw new Error("PDF statements must be between 1 byte and 20 MB.");
    }

    if (!isResume) {
      const { error: uploadError } = await supabase.storage
        .from("statements")
        .upload(filePath, file, {
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
          file_path: filePath,
          file_name: name,
          file_size: fileSize,
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
    const form = new FormData();
    form.append("file", file, name);
    if (password?.trim()) form.append("password", password);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, PDF_PROCESSOR_TIMEOUT_MS);
    let response: Response;
    try {
      console.info("[TracePay][statement] processor_request_started", {
        statementId: id,
        processorUrl,
      });
      response = await fetch(`${processorUrl}/extraction/preview`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      if (
        timedOut ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw new Error(
          "PDF processing timed out after 300 seconds. Check that the processor is running and reachable, then try again.",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const payload = (await response.json()) as {
      detail?: string;
      raw_extraction?: { extraction_method?: string };
      validation?: {
        status?: "valid" | "warning" | "failed";
        confidence?: number;
        warnings?: string[];
        errors?: string[];
      };
      transactions?: ExtractedTransaction[];
    };
    const validation = payload.validation;
    console.info("[TracePay][statement] processor_request_completed", {
      statementId: id,
      httpStatus: response.status,
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
      !response.ok ||
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
    await persistPreview(preview, preferredInstitution);
    console.info("[TracePay][statement] import_completed", {
      statementId: id,
      status: preview.status,
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
