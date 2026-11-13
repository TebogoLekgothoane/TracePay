import { FINANCIAL_ACCOUNTS_SETUP_HREF } from "../accounts/account.navigation";
import { hasSavedStatementTransactions } from "../accounts/account.service";
import { decidePostAuth } from "../security/app-lock.policy";
import type { AppLockContextValue } from "../security/security.types";
import { consumeFreshAuthentication, getAuthUserId } from "./auth.service";

export type AuthenticatedHomeHref =
  | typeof FINANCIAL_ACCOUNTS_SETUP_HREF
  | "/(tabs)";

export type PostAuthHref =
  | AuthenticatedHomeHref
  | "/(auth)/unlock"
  | "/(auth)/welcome"
  | { pathname: "/(auth)/device-security"; params: { flow: string } };

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

type PostAuthLock = Pick<
  AppLockContextValue,
  "hasPin" | "pinOwnerId" | "clearDeviceLock" | "lockApp" | "unlockApp"
>;

/**
 * Called after the account sign-in flow. A server-verified sign-in satisfies
 * the local lock for the PIN owner; anyone else must create their own PIN.
 * Without a fresh server verification (e.g. a deep link to a post-login
 * screen) the app stays locked.
 */
export async function continueAfterAuth({
  appLock,
  router,
}: {
  appLock: PostAuthLock;
  router: { replace: (href: PostAuthHref) => void };
}): Promise<void> {
  const userId = await getAuthUserId().catch(() => null);
  const decision = decidePostAuth({
    freshlyAuthenticated: consumeFreshAuthentication(),
    userId,
    hasPin: appLock.hasPin,
    pinOwnerId: appLock.pinOwnerId,
  });

  switch (decision.action) {
    case "stay-locked":
      appLock.lockApp();
      router.replace(decision.to);
      return;
    case "replace-pin":
      await appLock.clearDeviceLock();
      router.replace({
        pathname: "/(auth)/device-security",
        params: { flow: "login" },
      });
      return;
    case "create-pin":
      router.replace({
        pathname: "/(auth)/device-security",
        params: { flow: "login" },
      });
      return;
    case "unlock":
      appLock.unlockApp();
      router.replace(await resolveAuthenticatedHomeHref());
      return;
  }
}
