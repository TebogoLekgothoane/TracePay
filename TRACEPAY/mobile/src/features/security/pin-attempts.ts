import {
  PIN_FREE_ATTEMPTS,
  PIN_LOCKOUT_SCHEDULE_MS,
  PIN_MAX_ATTEMPTS,
} from "./security.constants";

/**
 * Persisted wrong-PIN counter. Pure so the policy can be tested without
 * native modules; AppLockProvider stores it in SecureStore so restarting the
 * app never resets it.
 */
export type PinAttemptState = {
  failures: number;
  lockedUntil: number | null;
};

export type PinAttemptOutcome =
  | { kind: "retry"; remaining: number }
  | { kind: "locked"; until: number }
  | { kind: "wipe" };

export const INITIAL_PIN_ATTEMPTS: PinAttemptState = {
  failures: 0,
  lockedUntil: null,
};

export function lockoutDelayFor(failures: number): number {
  if (failures < PIN_FREE_ATTEMPTS) {
    return 0;
  }
  const index = Math.min(
    failures - PIN_FREE_ATTEMPTS,
    PIN_LOCKOUT_SCHEDULE_MS.length - 1,
  );
  return PIN_LOCKOUT_SCHEDULE_MS[index];
}

export function lockoutRemainingMs(state: PinAttemptState, now: number): number {
  if (state.lockedUntil === null) {
    return 0;
  }
  return Math.max(0, state.lockedUntil - now);
}

export function registerPinFailure(
  state: PinAttemptState,
  now: number,
): { state: PinAttemptState; outcome: PinAttemptOutcome } {
  const failures = state.failures + 1;

  if (failures >= PIN_MAX_ATTEMPTS) {
    return {
      state: { failures, lockedUntil: null },
      outcome: { kind: "wipe" },
    };
  }

  const delay = lockoutDelayFor(failures);
  if (delay > 0) {
    const until = now + delay;
    return {
      state: { failures, lockedUntil: until },
      outcome: { kind: "locked", until },
    };
  }

  return {
    state: { failures, lockedUntil: null },
    outcome: { kind: "retry", remaining: PIN_FREE_ATTEMPTS - failures },
  };
}

export function parsePinAttempts(raw: string | null): PinAttemptState {
  if (!raw) {
    return INITIAL_PIN_ATTEMPTS;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return INITIAL_PIN_ATTEMPTS;
    }
    const value = parsed as Partial<PinAttemptState>;
    const failures =
      typeof value.failures === "number" &&
      Number.isInteger(value.failures) &&
      value.failures >= 0
        ? value.failures
        : 0;
    const lockedUntil =
      typeof value.lockedUntil === "number" && Number.isFinite(value.lockedUntil)
        ? value.lockedUntil
        : null;
    return { failures, lockedUntil };
  } catch {
    // A corrupted counter must not grant extra attempts: treat it as one
    // short of the wipe threshold so the next failure forces re-login.
    return { failures: PIN_MAX_ATTEMPTS - 1, lockedUntil: null };
  }
}

export function formatLockoutRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}
