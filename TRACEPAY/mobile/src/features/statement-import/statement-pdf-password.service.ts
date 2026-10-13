import { secureStorage } from "../../lib/secure-storage";
import { statementPdfPasswordStorageKey } from "./statement-pdf-password.keys";

export { statementPdfPasswordStorageKey } from "./statement-pdf-password.keys";

/** Persist a working PDF password for later statement updates on this device. */
export async function saveStatementPdfPassword(
  accountId: string,
  password: string,
): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) {
    await clearStatementPdfPassword(accountId);
    return;
  }
  await secureStorage.set(statementPdfPasswordStorageKey(accountId), trimmed);
}

export async function loadStatementPdfPassword(
  accountId: string,
): Promise<string | null> {
  try {
    const value = await secureStorage.get(statementPdfPasswordStorageKey(accountId));
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function clearStatementPdfPassword(
  accountId: string | null | undefined,
): Promise<void> {
  if (!accountId?.trim()) return;
  try {
    await secureStorage.remove(statementPdfPasswordStorageKey(accountId));
  } catch {
    // Best-effort cleanup — do not block account/import flows.
  }
}
