/** Post a saved import to finding reconciliation. This module does not insert transactions. */

const STATEMENT_IMPORT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RECONCILIATION_PATH = "/finding-registry/imports/";
const DEFAULT_TIMEOUT_MS = 60_000;

export class FindingReconciliationError extends Error {
  readonly statementImportId: string;
  readonly extractedCount: number;

  constructor(statementImportId: string, message: string, extractedCount = 0) {
    super(message);
    this.name = "FindingReconciliationError";
    this.statementImportId = statementImportId;
    this.extractedCount = extractedCount;
  }
}

export function isFindingReconciliationError(
  value: unknown,
): value is FindingReconciliationError {
  return value instanceof FindingReconciliationError;
}

export function shouldReconcileSavedImport(
  status: string,
  savedTransactionCount: number,
): boolean {
  return (
    status === "processed" &&
    Number.isInteger(savedTransactionCount) &&
    savedTransactionCount >= 1
  );
}

type ReconciliationResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type ReconciliationFetch = (
  url: string,
  init: {
    method: "POST";
    headers: { Accept: string; Authorization: string };
    signal: AbortSignal;
  },
) => Promise<ReconciliationResponse>;

export async function postFindingReconciliation(input: {
  statementImportId: string;
  accessToken: string;
  baseUrl: string;
  fetchImpl?: ReconciliationFetch;
  timeoutMs?: number;
}): Promise<void> {
  const statementImportId = input.statementImportId.trim();
  if (!STATEMENT_IMPORT_ID.test(statementImportId)) {
    throw new FindingReconciliationError(
      statementImportId,
      "Finding reconciliation needs the saved statement import. Your statement is saved. Try again.",
    );
  }
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new FindingReconciliationError(
      statementImportId,
      "Your session has expired. Your statement is saved. Sign in and try again.",
    );
  }
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new FindingReconciliationError(
      statementImportId,
      "Finding reconciliation is not configured. Your statement is saved. Try again.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as ReconciliationFetch);
  try {
    const response = await fetchImpl(
      `${baseUrl}${RECONCILIATION_PATH}${encodeURIComponent(statementImportId)}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isReconciliationResult(payload, statementImportId)) {
      throw new FindingReconciliationError(
        statementImportId,
        failureMessage(response.ok ? 502 : response.status, payload),
      );
    }
  } catch (error) {
    if (isFindingReconciliationError(error)) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new FindingReconciliationError(
        statementImportId,
        "Finding reconciliation timed out. Your statement is saved. Try again.",
      );
    }
    throw new FindingReconciliationError(
      statementImportId,
      "Could not reach finding reconciliation. Your statement is saved. Try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function reconcileIfSaved(input: {
  statementImportId: string;
  status: string;
  savedTransactionCount: number;
  reconcile: (statementImportId: string) => Promise<void>;
}): Promise<void> {
  if (!shouldReconcileSavedImport(input.status, input.savedTransactionCount)) {
    return;
  }
  await input.reconcile(input.statementImportId);
}

/** Retry posts the same import id. It has no transaction insert step. */
export async function retrySavedImportReconciliation(input: {
  statementImportId: string;
  reconcile: (statementImportId: string) => Promise<void>;
}): Promise<void> {
  await input.reconcile(input.statementImportId);
}

function isReconciliationResult(value: unknown, statementImportId: string): boolean {
  if (!isRecord(value) || value.statement_import_id !== statementImportId) {
    return false;
  }
  const counts = [
    value.findings_seen,
    value.new_findings,
    value.unchanged_findings,
    value.materially_changed_findings,
    value.not_observed_findings,
    value.writes,
  ];
  return counts.every((count) => typeof count === "number" && Number.isFinite(count) && count >= 0);
}

function failureMessage(status: number, payload: unknown): string {
  if (status === 401) {
    return "Your session has expired. Your statement is saved. Sign in and try again.";
  }
  const detail =
    isRecord(payload) && typeof payload.detail === "string" ? payload.detail.trim() : "";
  if (
    detail.length > 0 &&
    detail.length <= 160 &&
    !/\d{6,}/.test(detail) &&
    !/traceback|stack/i.test(detail)
  ) {
    return `${detail} Your statement is saved. Try again.`;
  }
  return "Finding reconciliation could not finish. Your statement is saved. Try again.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
