import { FINANCIAL_ACCOUNTS_SETUP_HREF } from "../accounts/account.navigation";
import { hasSavedStatementTransactions } from "../accounts/account.service";

export type AuthenticatedHomeHref =
  | typeof FINANCIAL_ACCOUNTS_SETUP_HREF
  | "/(tabs)";

export type PostAuthHref = AuthenticatedHomeHref | "/(auth)/unlock";

export function authFlowParams(flow: unknown): { flow: string } | Record<string, never> {
  return typeof flow === "string" && flow.length > 0 ? { flow } : {};
}

/**
 * Home is only available after at least one statement import saved transactions.
 * Empty provisional bank accounts are pruned and do not unlock the app.
 */
export async function resolveAuthenticatedHomeHref(): Promise<AuthenticatedHomeHref> {
  try {
    if (await hasSavedStatementTransactions()) {
      return "/(tabs)";
    }
    return FINANCIAL_ACCOUNTS_SETUP_HREF;
  } catch {
    return FINANCIAL_ACCOUNTS_SETUP_HREF;
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
