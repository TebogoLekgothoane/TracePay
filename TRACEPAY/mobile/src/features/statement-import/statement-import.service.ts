import type { DocumentPickerAsset } from "expo-document-picker";
import * as Crypto from "expo-crypto";

import { ensureBankAccount } from "../accounts/account.service";
import { getSupabase } from "../../lib/supabase";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export type ExtractedTransaction = {
  date: string;
  description: string;
  amount: number | string;
  type: "debit" | "credit";
  balance?: number | string | null;
  currency?: string;
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

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
}

function accountLabelFromFilename(filename: string, preferredInstitution?: string | null): string {
  const preferred = preferredInstitution?.trim();
  if (preferred) return preferred.slice(0, 80);
  const label = filename
    .replace(/\.pdf$/i, "")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (label || "Imported bank statement").slice(0, 80);
}

async function failAndCleanup(statementId: string, filePath: string, message: string): Promise<never> {
  console.error("[TracePay][statement] cleanup_failed_import", { statementId, message });
  const supabase = getSupabase();
  await supabase.from("statement_imports").update({ status: "failed", error_message: message }).eq("id", statementId);
  await supabase.from("transactions").delete().eq("statement_id", statementId);
  await supabase.storage.from("statements").remove([filePath]);
  throw new Error(message);
}

async function persistPreview(preview: PdfStatementPreview, preferredInstitution?: string | null): Promise<void> {
  console.info("[TracePay][statement] persist_started", { statementId: preview.statementId, transactionCount: preview.transactions.length, status: preview.status });
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in before saving transactions.");
  const account = await ensureBankAccount(accountLabelFromFilename(preview.filename, preferredInstitution));
  console.info("[TracePay][statement] connected_account_ready", { accountId: account.id, accountName: account.name });
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
  }));
  const { error } = await supabase.from("transactions").insert(rows);
  if (error) throw new Error("The extracted transactions could not be saved.");
  const { error: updateError } = await supabase.from("statement_imports").update({
    status: "processed",
    extraction_method: preview.extractionMethod,
    transaction_count: rows.length,
    processed_at: new Date().toISOString(),
  }).eq("id", preview.statementId);
  if (updateError) throw new Error("The statement could not be marked as processed.");
  console.info("[TracePay][statement] persist_completed", { statementId: preview.statementId, transactionCount: rows.length });
}

export async function preparePdfStatement(asset: DocumentPickerAsset, preferredInstitution?: string | null): Promise<PdfStatementPreview> {
  const name = asset.name || "statement.pdf";
  console.info("[TracePay][statement] import_started", { filename: name, sizeBytes: asset.size ?? null, mimeType: asset.mimeType ?? null });
  if (!name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF bank statement.");
  if (asset.mimeType && asset.mimeType !== "application/pdf") throw new Error("The selected file is not a PDF.");
  if (asset.size && asset.size > MAX_FILE_SIZE) throw new Error("PDF statements must be smaller than 20 MB.");

  const supabase = getSupabase();
  const [{ data: userData, error: userError }, { data: sessionData, error: sessionError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (userError || sessionError || !userData.user || !sessionData.session?.access_token) throw new Error("Sign in before importing a statement.");

  const id = Crypto.randomUUID();
  const filePath = `statements/${userData.user.id}/${id}.pdf`;
  let recordCreated = false;
  try {
    const fileResponse = await fetch(asset.uri);
    if (!fileResponse.ok) throw new Error("TracePay could not read the selected PDF.");
    const file = await fileResponse.blob();
    const fileSize = asset.size ?? file.size;
    if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) throw new Error("PDF statements must be between 1 byte and 20 MB.");

    const { error: uploadError } = await supabase.storage.from("statements").upload(filePath, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error("The statement could not be uploaded securely.");
    console.info("[TracePay][statement] storage_upload_completed", { statementId: id, sizeBytes: fileSize });
    const { error: importError } = await supabase.from("statement_imports").insert({ id, user_id: userData.user.id, file_path: filePath, file_name: name, file_size: fileSize, status: "uploaded" });
    if (importError) {
      await supabase.storage.from("statements").remove([filePath]);
      throw new Error("The statement record could not be created.");
    }
    recordCreated = true;
    const { error: processingError } = await supabase.from("statement_imports").update({ status: "processing" }).eq("id", id);
    if (processingError) throw new Error("The statement could not be marked as processing.");
    console.info("[TracePay][statement] processing_status_updated", { statementId: id, status: "processing" });

    const processorUrl = (process.env.EXPO_PUBLIC_PDF_PROCESSOR_URL ?? "").trim().replace(/\/$/, "");
    if (!processorUrl) return await failAndCleanup(id, filePath, "The PDF processor is not configured yet.");
    const form = new FormData();
    form.append("file", file, name);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      console.info("[TracePay][statement] processor_request_started", { statementId: id, processorUrl });
      response = await fetch(`${processorUrl}/extraction/preview`, { method: "POST", headers: { Authorization: `Bearer ${sessionData.session.access_token}` }, body: form, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    const payload = (await response.json()) as { detail?: string; raw_extraction?: { extraction_method?: string }; validation?: { status?: "valid" | "warning" | "failed"; confidence?: number; warnings?: string[]; errors?: string[] }; transactions?: ExtractedTransaction[] };
    const validation = payload.validation;
    console.info("[TracePay][statement] processor_request_completed", { statementId: id, httpStatus: response.status, extractionMethod: payload.raw_extraction?.extraction_method ?? "unknown", validationStatus: validation?.status ?? "missing", transactionCount: payload.transactions?.length ?? 0, confidence: validation?.confidence ?? null });
    if (!response.ok || validation?.status === "failed" || !payload.transactions || !validation) {
      return await failAndCleanup(id, filePath, payload.detail ?? validation?.errors?.join(" ") ?? "PDF extraction failed.");
    }

    const preview: PdfStatementPreview = {
      filename: name,
      statementId: id,
      filePath,
      status: validation.status === "warning" ? "warning" : "valid",
      extractionMethod: (payload.raw_extraction?.extraction_method ?? "unknown") as PdfStatementPreview["extractionMethod"],
      confidence: validation.confidence ?? 0,
      warnings: validation.warnings ?? [],
      transactions: payload.transactions,
    };
    if (preview.status === "warning") {
      console.warn("[TracePay][statement] saving_extracted_rows_with_warnings", { statementId: id, warningCount: preview.warnings.length, confidence: preview.confidence });
    }
    await persistPreview(preview, preferredInstitution);
    console.info("[TracePay][statement] import_completed", { statementId: id, status: preview.status });
    return preview;
  } catch (error) {
    console.error("[TracePay][statement] import_failed", { statementId: id, message: errorMessage(error, "PDF processing failed.") });
    if (recordCreated) return await failAndCleanup(id, filePath, errorMessage(error, "PDF processing failed."));
    throw error;
  }
}
