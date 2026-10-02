import { requireAuthenticatedUserId } from "./account.service";
import { AccountError } from "./account.errors";
import { getSupabase } from "../../lib/supabase";

export type StatementImportRecord = {
  id: string;
  accountId: string | null;
  fileName: string;
  fileSize: number;
  status: "uploaded" | "processing" | "processed" | "failed";
  format: "pdf" | "csv";
  transactionCount: number;
  statementStartDate: string | null;
  statementEndDate: string | null;
  createdAt: string;
  processedAt: string | null;
  errorMessage: string | null;
};

export type AccountStatementStats = {
  accountId: string;
  statementCount: number;
  transactionCount: number;
  latestStatementAt: string | null;
};

function readStatementRow(value: unknown): StatementImportRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.file_name !== "string") return null;
  return {
    id: row.id,
    accountId: typeof row.account_id === "string" ? row.account_id : null,
    fileName: row.file_name,
    fileSize: Number(row.file_size ?? 0),
    status: row.status as StatementImportRecord["status"],
    format: (row.format === "csv" ? "csv" : "pdf") as StatementImportRecord["format"],
    transactionCount: Number(row.transaction_count ?? 0),
    statementStartDate:
      typeof row.statement_start_date === "string" ? row.statement_start_date : null,
    statementEndDate:
      typeof row.statement_end_date === "string" ? row.statement_end_date : null,
    createdAt: String(row.created_at ?? ""),
    processedAt: typeof row.processed_at === "string" ? row.processed_at : null,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
  };
}

export async function listStatementsForAccount(
  accountId: string,
): Promise<StatementImportRecord[]> {
  await requireAuthenticatedUserId();
  const { data, error } = await getSupabase()
    .from("statement_imports")
    .select(
      "id, account_id, file_name, file_size, status, format, transaction_count, statement_start_date, statement_end_date, created_at, processed_at, error_message",
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AccountError("Could not load statement history.");
  }

  return (data ?? [])
    .map((row) => readStatementRow(row))
    .filter((row): row is StatementImportRecord => row !== null);
}

export async function loadAccountStatementStats(
  accountIds: readonly string[],
): Promise<Record<string, AccountStatementStats>> {
  await requireAuthenticatedUserId();
  if (accountIds.length === 0) return {};

  const { data, error } = await getSupabase().rpc("account_statement_stats", {
    p_account_ids: [...accountIds],
  });

  if (error) {
    throw new AccountError("Could not load account activity.");
  }

  const stats: Record<string, AccountStatementStats> = {};
  for (const row of data ?? []) {
    const accountId = row?.account_id;
    if (typeof accountId !== "string") continue;
    stats[accountId] = {
      accountId,
      statementCount: Number(row.statement_count ?? 0),
      transactionCount: Number(row.transaction_count ?? 0),
      latestStatementAt:
        typeof row.latest_statement_at === "string"
          ? row.latest_statement_at
          : null,
    };
  }
  return stats;
}
