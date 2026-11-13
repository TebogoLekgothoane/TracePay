import { getPdfProcessorBaseUrl } from "../constants/config";
import { parseStatementCoverage, StatementCoverageApiError } from "../features/statement-coverage/statement-coverage.parse";
import type { StatementCoverage } from "../features/statement-coverage/statement-coverage.types";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export { StatementCoverageApiError };

const REQUEST_TIMEOUT_MS = 20_000;

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new StatementCoverageApiError("Sign in to see your statement coverage.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new StatementCoverageApiError("Sign in to see your statement coverage.");
  }
  return token;
}

export async function fetchStatementCoverage(signal?: AbortSignal): Promise<StatementCoverage> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new StatementCoverageApiError("Statement coverage is not configured.");
  }
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward, { once: true });
  try {
    const response = await fetch(`${baseUrl}/statement-coverage`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new StatementCoverageApiError(
        "Could not load your statement coverage. Please try again.",
        response.status,
      );
    }
    return parseStatementCoverage(payload);
  } catch (error) {
    if (error instanceof StatementCoverageApiError) throw error;
    if (controller.signal.aborted && !signal?.aborted) {
      throw new StatementCoverageApiError("Loading statement coverage timed out. Please try again.");
    }
    throw new StatementCoverageApiError("Could not load your statement coverage. Please try again.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forward);
  }
}

/**
 * Ask the API to link own-account transfers and refunds from evidence. Best
 * effort: the import is already saved, and the same decision is re-derived on
 * every analysis read, so a failure only delays the stored totals.
 */
export async function requestTransferReconciliation(): Promise<boolean> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) return false;
  try {
    const token = await accessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${baseUrl}/consolidation/reconcile`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}
