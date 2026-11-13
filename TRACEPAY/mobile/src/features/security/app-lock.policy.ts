/**
 * Pure app-lock decisions shared by AppLockProvider and the root navigator.
 * Kept free of React Native imports so they can be unit tested.
 */

export type AppLifecycleState = "active" | "background" | "inactive" | string;

/**
 * Only time spent in `background` counts. iOS reports `inactive` while the
 * Face ID sheet, Control Centre or the app switcher is up, and counting it
 * re-locked the app right after a slow biometric unlock.
 */
export function nextBackgroundedAt(
  previous: AppLifecycleState,
  next: AppLifecycleState,
  backgroundedAt: number | null,
  now: number,
): number | null {
  if (next === "background" && previous !== "background") {
    return now;
  }
  if (next === "active") {
    return null;
  }
  return backgroundedAt;
}

export function shouldLockOnResume(args: {
  hasPin: boolean;
  backgroundedAt: number | null;
  now: number;
  timeoutMs: number;
}): boolean {
  return (
    args.hasPin &&
    args.backgroundedAt !== null &&
    args.now - args.backgroundedAt >= args.timeoutMs
  );
}

export type RouteKind =
  | "welcome"
  | "unlock"
  | "auth-entry"
  | "pin-setup"
  | "pin-reset"
  | "financial-setup"
  | "onboarding"
  | "protected"
  | "root";

const AUTH_ENTRY_SCREENS = new Set([
  "otp",
  "new-password",
  "password-updated",
]);
const PIN_SETUP_SCREENS = new Set([
  "device-security",
  "confirm-pin",
  "biometric-setup",
]);
const FINANCIAL_SETUP_SCREENS = new Set([
  "financial-data-consent",
  "consent-form",
  "financial-accounts-setup",
  "notification-consent",
  "sms-consent",
  "scan-inbox",
]);

export function classifyRoute(segments: readonly string[]): RouteKind {
  const group = segments[0];
  const screen = segments[1] ?? "";

  if (group === undefined) {
    return "root";
  }
  if (group === "(onboarding)") {
    return "onboarding";
  }
  if (group !== "(auth)") {
    return "protected";
  }
  if (screen === "welcome") {
    return "welcome";
  }
  if (screen === "unlock") {
    return "unlock";
  }
  if (screen === "reset-pin") {
    return "pin-reset";
  }
  if (AUTH_ENTRY_SCREENS.has(screen)) {
    return "auth-entry";
  }
  if (PIN_SETUP_SCREENS.has(screen)) {
    return "pin-setup";
  }
  if (FINANCIAL_SETUP_SCREENS.has(screen)) {
    return "financial-setup";
  }
  // Unknown auth screens are treated as protected so new screens fail closed.
  return "protected";
}

export type GuardInput = {
  route: RouteKind;
  hasSession: boolean;
  hasPin: boolean;
  isLocked: boolean;
};

export type GuardDecision =
  | { action: "stay" }
  | { action: "redirect"; to: "/(auth)/welcome" | "/(auth)/unlock" | "/(auth)/device-security" }
  /** Resolve the authenticated home (tabs or statement setup). */
  | { action: "home" };

/**
 * Single source of truth for who may see which route. Order matters:
 * no session → sign-in; session but locked → unlock; session without PIN →
 * PIN setup; otherwise the app.
 */
export function decideRoute(input: GuardInput): GuardDecision {
  const { route, hasSession, hasPin, isLocked } = input;

  if (!hasSession) {
    if (
      route === "welcome" ||
      route === "auth-entry" ||
      route === "onboarding" ||
      route === "root"
    ) {
      return { action: "stay" };
    }
    return { action: "redirect", to: "/(auth)/welcome" };
  }

  if (hasPin && isLocked) {
    // Reachable while locked: the unlock screen, the re-authentication
    // explainer, and credential screens that only succeed after a real
    // server check (OTP / reset token). PIN setup is never reachable here:
    // it would let anyone replace the PIN.
    if (route === "unlock" || route === "pin-reset" || route === "auth-entry") {
      return { action: "stay" };
    }
    return { action: "redirect", to: "/(auth)/unlock" };
  }

  if (!hasPin) {
    if (route === "pin-setup" || route === "auth-entry") {
      return { action: "stay" };
    }
    return { action: "redirect", to: "/(auth)/device-security" };
  }

  // Signed in and unlocked. PIN setup stays reachable for "Change PIN";
  // device-security asks for the current PIN before accepting a new one.
  if (
    route === "welcome" ||
    route === "unlock" ||
    route === "pin-reset" ||
    route === "root"
  ) {
    return { action: "home" };
  }
  return { action: "stay" };
}

export type PostAuthDecision =
  /** No fresh server verification: keep the app locked. */
  | { action: "stay-locked"; to: "/(auth)/unlock" | "/(auth)/welcome" }
  /** Another user's PIN is on this device: wipe it, then create a new one. */
  | { action: "replace-pin" }
  | { action: "create-pin" }
  | { action: "unlock" };

/**
 * After the account sign-in flow. Only a sign-in the auth server verified
 * in this process (password/OTP) may satisfy the local lock, and only for
 * the user who owns the PIN.
 */
export function decidePostAuth(input: {
  freshlyAuthenticated: boolean;
  userId: string | null;
  hasPin: boolean;
  pinOwnerId: string | null;
}): PostAuthDecision {
  const { freshlyAuthenticated, userId, hasPin, pinOwnerId } = input;

  if (!freshlyAuthenticated || !userId) {
    return {
      action: "stay-locked",
      to: userId && hasPin ? "/(auth)/unlock" : "/(auth)/welcome",
    };
  }
  if (!hasPin) {
    return { action: "create-pin" };
  }
  if (pinOwnerId && pinOwnerId !== userId) {
    return { action: "replace-pin" };
  }
  return { action: "unlock" };
}
