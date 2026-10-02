import { secureStorage } from "../../lib/secure-storage";

const FINANCIAL_ACCOUNTS_SETUP_DISMISSED_KEY =
  "tracepay.financial_accounts_setup.dismissed.v1";

export async function loadFinancialAccountsSetupDismissed(): Promise<boolean> {
  const value = await secureStorage.get(FINANCIAL_ACCOUNTS_SETUP_DISMISSED_KEY);
  return value === "1";
}

export async function dismissFinancialAccountsSetup(): Promise<void> {
  await secureStorage.set(FINANCIAL_ACCOUNTS_SETUP_DISMISSED_KEY, "1");
}

export async function clearFinancialAccountsSetupDismissed(): Promise<void> {
  await secureStorage.remove(FINANCIAL_ACCOUNTS_SETUP_DISMISSED_KEY);
}
