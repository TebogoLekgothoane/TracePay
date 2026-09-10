import type { DocumentPickerAsset } from "expo-document-picker";

import type { FinancialAccount } from "../accounts/account.types";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { detectCsvColumns } from "./csv.columns";
import { buildDedupeKey, mapCsvRowsToCandidates } from "./csv.mapping";
import { parseCsvText } from "./csv.parse";
import { readPickedCsvFile } from "./csv.read";
import { hashText } from "./hash";
import {
  TransactionImportError,
  toTransactionImportError,
} from "./transaction-import.errors";
import { validateAccount } from "./csv.validation";
import type {
  CanonicalTransactionInsert,
  CsvImportPreview,
  CsvImportSuccess,
} from "./transaction-import.types";

const QUERY_BATCH_SIZE = 200;
const INSERT_BATCH_SIZE = 200;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_PREVIEW_ROWS = 20;
const MAX_INVALID_ROWS = 10;
const inflightImports = new Set<string>();

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TransactionImportError("cancelled", "The import was cancelled.");
  }
}

async function withTimeout<T>(
  run: () => PromiseLike<T>,
  timeoutMessage: string,
  signal?: AbortSignal,
): Promise<T> {
  assertNotAborted(signal);

  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new TransactionImportError("timeout", timeoutMessage));
    }, REQUEST_TIMEOUT_MS);

    void Promise.resolve(run())
      .then((result) => {
        clearTimeout(timeout);
        assertNotAborted(signal);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function runWithRetry<T>(
  run: () => PromiseLike<T>,
  timeoutMessage: string,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await withTimeout(run, timeoutMessage, signal);
  } catch (firstError) {
    const normalized = toTransactionImportError(firstError);
    if (
      normalized.code === "cancelled" ||
      normalized.code === "file_access" ||
      normalized.code === "not_csv" ||
      normalized.code === "empty_csv" ||
      normalized.code === "invalid_csv" ||
      normalized.code === "unsupported_columns" ||
      normalized.code === "malformed_csv"
    ) {
      throw normalized;
    }

    try {
      return await withTimeout(run, timeoutMessage, signal);
    } catch (secondError) {
      throw toTransactionImportError(secondError);
    }
  }
}

async function requireUserId(signal?: AbortSignal): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new TransactionImportError(
      "network",
      "Supabase is not configured for transaction imports.",
    );
  }

  const { data, error } = await runWithRetry(
    () => getSupabase().auth.getUser(),
    "Checking your session took too long. Please try again.",
    signal,
  );

  if (error || !data.user?.id) {
    throw new TransactionImportError(
      "not_authenticated",
      "Sign in to import transactions.",
    );
  }

  return data.user.id;
}

async function readCsvFile(asset: DocumentPickerAsset): Promise<string> {
  return await readPickedCsvFile(asset);
}

async function listExistingDedupeKeys(
  accountId: string,
  keys: readonly string[],
  signal?: AbortSignal,
): Promise<Set<string>> {
  if (keys.length === 0) {
    return new Set();
  }

  const existing = new Set<string>();
  const supabase = getSupabase();

  for (let start = 0; start < keys.length; start += QUERY_BATCH_SIZE) {
    assertNotAborted(signal);
    const chunk = keys.slice(start, start + QUERY_BATCH_SIZE);

    const { data, error } = await runWithRetry<{
      data: Array<{ dedupe_key?: string | null }> | null;
      error: { message?: string } | null;
    }>(
      async () =>
        await supabase
          .from("transactions")
          .select("dedupe_key")
          .eq("account_id", accountId)
          .in("dedupe_key", chunk),
      "Checking for duplicate transactions took too long. Please try again.",
      signal,
    );

    if (error) {
      throw new TransactionImportError(
        "database",
        "Could not check for duplicate transactions. Please try again.",
      );
    }

    for (const row of (data ?? []) as Array<{ dedupe_key?: string | null }>) {
      if (typeof row.dedupe_key === "string" && row.dedupe_key.length > 0) {
        existing.add(row.dedupe_key);
      }
    }
  }

  return existing;
}

async function hasCompletedImportForFile(
  accountId: string,
  fileSha256: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const { data, error } = await runWithRetry<{
    data: Array<{ id?: string }> | null;
    error: { message?: string } | null;
  }>(
    async () =>
      await getSupabase()
        .from("imports")
        .select("id")
        .eq("account_id", accountId)
        .eq("file_sha256", fileSha256)
        .eq("status", "completed")
        .limit(1),
    "Checking existing imports took too long. Please try again.",
    signal,
  );

  if (error) {
    throw new TransactionImportError(
      "database",
      "Could not check previous imports. Please try again.",
    );
  }

  return Array.isArray(data) && data.length > 0;
}

async function ensureAccountStillOwned(
  accountId: string,
  signal?: AbortSignal,
): Promise<void> {
  const { data, error } = await runWithRetry<{
    data: { id?: string } | null;
    error: { message?: string } | null;
  }>(
    async () =>
      await getSupabase()
        .from("accounts")
        .select("id")
        .eq("id", accountId)
        .maybeSingle(),
    "Checking your selected account took too long. Please try again.",
    signal,
  );

  if (error || !data) {
    throw new TransactionImportError(
      "invalid_account",
      "Choose one of your linked accounts before importing.",
    );
  }
}

export async function createCsvImportPreview(args: {
  account: FinancialAccount;
  asset: DocumentPickerAsset;
  signal?: AbortSignal;
}): Promise<CsvImportPreview> {
  const account = validateAccount(args.account);
  await requireUserId(args.signal);
  assertNotAborted(args.signal);

  const fileText = await readCsvFile(args.asset);
  const fileSha256 = hashText(fileText);
  const parsed = parseCsvText(fileText);
  const mapping = detectCsvColumns(parsed);
  const mapped = mapCsvRowsToCandidates(parsed.rows, mapping, account);

  const duplicateKeyByRow = new Map<number, string>();
  const duplicateRows = new Set<number>();
  const seenFileKeys = new Set<string>();

  for (const candidate of mapped.candidates) {
    const dedupeKey = buildDedupeKey(account.id, candidate.dedupeBase);
    duplicateKeyByRow.set(candidate.rowNumber, dedupeKey);

    if (seenFileKeys.has(dedupeKey)) {
      duplicateRows.add(candidate.rowNumber);
      continue;
    }
    seenFileKeys.add(dedupeKey);
  }

  const existingKeys = await listExistingDedupeKeys(
    account.id,
    [...seenFileKeys],
    args.signal,
  );
  const exactFileDuplicate = await hasCompletedImportForFile(
    account.id,
    fileSha256,
    args.signal,
  );

  const previewRows = mapped.candidates.map((candidate) => {
    const dedupeKey = duplicateKeyByRow.get(candidate.rowNumber) ?? "";
    const isDuplicate =
      duplicateRows.has(candidate.rowNumber) || existingKeys.has(dedupeKey);

    return {
      ...candidate.preview,
      isDuplicate,
      issues: isDuplicate
        ? ["This transaction already exists for the selected account."]
        : candidate.preview.issues,
    };
  });

  const duplicateCount = previewRows.filter((row) => row.isDuplicate).length;
  const attentionMessages: string[] = [];

  if (mapped.invalidRows.length > 0) {
    attentionMessages.push(
      `${mapped.invalidRows.length} row${mapped.invalidRows.length === 1 ? "" : "s"} need attention and will not be imported.`,
    );
  }

  if (duplicateCount > 0) {
    attentionMessages.push(
      `${duplicateCount} row${duplicateCount === 1 ? "" : "s"} already exist for this account and will be skipped.`,
    );
  }

  if (exactFileDuplicate) {
    attentionMessages.push(
      "This exact CSV file appears to have been imported before for this account.",
    );
  }

  return {
    account: {
      id: account.id,
      name: account.name,
      currency: account.currency,
    },
    fileName: args.asset.name,
    fileSha256,
    mapping,
    totalRows: parsed.rows.length,
    validRows: mapped.candidates.length,
    invalidRows: mapped.invalidRows.length,
    duplicateRows: duplicateCount,
    exactFileDuplicate,
    attentionMessages,
    previewRows: previewRows.slice(0, MAX_PREVIEW_ROWS),
    invalidRowDetails: mapped.invalidRows.slice(0, MAX_INVALID_ROWS),
    candidateRows: mapped.candidates,
  };
}

async function createImportRecord(preview: CsvImportPreview, signal?: AbortSignal): Promise<string> {
  const { data, error } = await runWithRetry<{
    data: { id?: string } | null;
    error: { message?: string } | null;
  }>(
    async () =>
      await getSupabase()
        .from("imports")
        .insert({
          account_id: preview.account.id,
          source: "csv",
          file_name: preview.fileName,
          file_sha256: preview.fileSha256,
          status: "uploaded",
          detected_mapping: preview.mapping,
          total_rows: preview.totalRows,
          valid_rows: preview.validRows,
          invalid_rows: preview.invalidRows,
          duplicate_rows: preview.duplicateRows,
        })
        .select("id")
        .single(),
    "Creating the import record took too long. Please try again.",
    signal,
  );

  if (error || !data?.id) {
    throw new TransactionImportError(
      "database",
      "Could not start the transaction import. Please try again.",
    );
  }

  await updateImportRecord(
    data.id,
    {
      status: "processing",
      duplicate_rows: preview.duplicateRows,
    },
    "Updating the import status took too long. Please try again.",
    signal,
  );

  return data.id;
}

async function updateImportRecord(
  importId: string,
  patch: Record<string, unknown>,
  timeoutMessage: string,
  signal?: AbortSignal,
): Promise<void> {
  const { error } = await runWithRetry<{
    error: { message?: string } | null;
  }>(
    async () => await getSupabase().from("imports").update(patch).eq("id", importId),
    timeoutMessage,
    signal,
  );

  if (error) {
    throw new TransactionImportError(
      "database",
      "Could not update the transaction import. Please try again.",
    );
  }
}

function dedupePreviewRows(preview: CsvImportPreview): Array<CanonicalTransactionInsert> {
  return preview.candidateRows.map((candidate) => ({
    ...candidate.insert,
    dedupe_key: buildDedupeKey(preview.account.id, candidate.dedupeBase),
  }));
}

export async function importCsvTransactions(args: {
  preview: CsvImportPreview;
  signal?: AbortSignal;
}): Promise<CsvImportSuccess> {
  await requireUserId(args.signal);
  await ensureAccountStillOwned(args.preview.account.id, args.signal);

  const importKey = `${args.preview.account.id}:${args.preview.fileSha256}`;
  if (inflightImports.has(importKey)) {
    throw new TransactionImportError(
      "duplicate_import",
      "This CSV import is already in progress.",
    );
  }

  inflightImports.add(importKey);
  let importId: string | null = null;

  try {
    const rows = dedupePreviewRows(args.preview);
    const fileSeen = new Set<string>();
    const uniqueRows = rows.filter((row) => {
      if (fileSeen.has(row.dedupe_key)) {
        return false;
      }
      fileSeen.add(row.dedupe_key);
      return true;
    });

    const existingKeys = await listExistingDedupeKeys(
      args.preview.account.id,
      uniqueRows.map((row) => row.dedupe_key),
      args.signal,
    );
    const rowsToInsert = uniqueRows.filter((row) => !existingKeys.has(row.dedupe_key));

    importId = await createImportRecord(
      {
        ...args.preview,
        duplicateRows: args.preview.validRows - rowsToInsert.length,
      },
      args.signal,
    );

    let importedCount = 0;
    const supabase = getSupabase();

    for (let start = 0; start < rowsToInsert.length; start += INSERT_BATCH_SIZE) {
      assertNotAborted(args.signal);
      const chunk = rowsToInsert.slice(start, start + INSERT_BATCH_SIZE).map((row) => ({
        ...row,
        import_id: importId,
      }));

      const { data, error } = await runWithRetry<{
        data: Array<{ id?: string }> | null;
        error: { message?: string } | null;
      }>(
        async () =>
          await supabase
            .from("transactions")
            .upsert(chunk, {
              onConflict: "account_id,dedupe_key",
              ignoreDuplicates: true,
            })
            .select("id"),
        "Importing transactions took too long. Please try again.",
        args.signal,
      );

      if (error) {
        throw new TransactionImportError(
          "database",
          "Could not save the imported transactions. Please try again.",
        );
      }

      importedCount += Array.isArray(data) ? data.length : 0;
    }

    const duplicateCount = args.preview.validRows - importedCount;
    await updateImportRecord(
      importId,
      {
        status: "completed",
        duplicate_rows: duplicateCount,
        completed_at: new Date().toISOString(),
      },
      "Finishing the import took too long. Please try again.",
      args.signal,
    );

    return {
      importId,
      importedCount,
      duplicateCount,
      invalidCount: args.preview.invalidRows,
      totalRows: args.preview.totalRows,
      accountName: args.preview.account.name,
      fileName: args.preview.fileName,
    };
  } catch (error) {
    if (importId) {
      try {
        await updateImportRecord(
          importId,
          {
            status: "failed",
            error_message: "The CSV import did not complete.",
          },
          "Marking the import as failed took too long. Please try again.",
          args.signal,
        );
      } catch {
        // Ignore secondary failure so the user sees the original import error.
      }
    }

    throw toTransactionImportError(error);
  } finally {
    inflightImports.delete(importKey);
  }
}
