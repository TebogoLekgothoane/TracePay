import { FINANCIAL_ACCOUNTS_SETUP_HREF } from "../accounts/account.navigation";
import { loadFinancialAccountsSetupDismissed } from "../accounts/account-setup.service";
import { listAccounts } from "../accounts/account.service";

export type AuthenticatedHomeHref =
  | typeof FINANCIAL_ACCOUNTS_SETUP_HREF
  | "/(tabs)";

export type PostAuthHref = AuthenticatedHomeHref | "/(auth)/unlock";

export function authFlowParams(flow: unknown): { flow: string } | Record<string, never> {
  return typeof flow === "string" && flow.length > 0 ? { flow } : {};
}

export async function resolveAuthenticatedHomeHref(): Promise<AuthenticatedHomeHref> {
  try {
    const [accounts, setupDismissed] = await Promise.all([
      listAccounts(),
      loadFinancialAccountsSetupDismissed(),
    ]);
    if (accounts.length > 0 || setupDismissed) {
      return "/(tabs)";
    }
    return FINANCIAL_ACCOUNTS_SETUP_HREF;
  } catch {
    return "/(tabs)";
  }
}

export async function continueAfterAuth({
  hasPin,
  lockApp,
  router,
  unlockApp,
}: {
  hasPin: boolean;
  lockApp: () => void;
  router: { replace: (href: PostAuthHref) => void };
  unlockApp: () => void;
}): Promise<void> {
  if (hasPin) {
    lockApp();
    router.replace("/(auth)/unlock");
    return;
  }

  unlockApp();
  router.replace(await resolveAuthenticatedHomeHref());
}
