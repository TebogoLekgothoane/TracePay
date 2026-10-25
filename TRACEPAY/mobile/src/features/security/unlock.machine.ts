/**
 * Unlock-screen state machine. The screen only renders from this state and
 * runs side effects (OS biometric prompt, PIN verification, navigation) when
 * the phase changes, so duplicate prompts and competing unlocks are
 * impossible by construction.
 *
 *   starting ──► biometric ──success──► unlocking
 *      │            │ fail/cancel/unavailable
 *      │            ▼
 *      └──────────► pin ──submit──► verifying ──ok──► unlocking
 *                   ▲  ▲               │ wrong
 *                   │  └───────────────┤
 *                   │                  │ too many
 *                   └── locked_out ◄───┤
 *                                      └──► signed_out (PIN wiped)
 */

export type UnlockPhase =
  | "starting"
  | "biometric"
  | "pin"
  | "verifying"
  | "locked_out"
  | "unlocking"
  | "signed_out";

export type UnlockState = {
  phase: UnlockPhase;
  canUseBiometrics: boolean;
  /** Increments each time an OS biometric prompt should be shown. */
  biometricRequestId: number;
  /** Increments on each wrong PIN so the keypad can shake and clear. */
  pinErrorId: number;
  message: string | null;
  pinError: string | null;
  lockedUntil: number | null;
};

export type UnlockEvent =
  | { type: "START"; canUseBiometrics: boolean; lockedUntil: number | null }
  | { type: "REQUEST_BIOMETRIC" }
  | { type: "BIOMETRIC_SUCCESS" }
  | { type: "BIOMETRIC_FAILED"; message: string }
  | { type: "BIOMETRIC_UNAVAILABLE"; message: string }
  | { type: "USE_PIN" }
  | { type: "PIN_SUBMITTED" }
  | { type: "PIN_SUCCESS" }
  | { type: "PIN_INCORRECT"; remaining: number }
  | { type: "PIN_LOCKED"; until: number }
  | { type: "LOCKOUT_EXPIRED" }
  | { type: "PIN_WIPED" }
  | { type: "CLEAR_PIN_ERROR" };

export const initialUnlockState: UnlockState = {
  phase: "starting",
  canUseBiometrics: false,
  biometricRequestId: 0,
  pinErrorId: 0,
  message: null,
  pinError: null,
  lockedUntil: null,
};

function incorrectPinCopy(remaining: number): string {
  if (remaining <= 0) {
    return "Incorrect PIN.";
  }
  return remaining === 1
    ? "Incorrect PIN. 1 attempt left before a delay."
    : `Incorrect PIN. ${remaining} attempts left before a delay.`;
}

export function unlockReducer(
  state: UnlockState,
  event: UnlockEvent,
): UnlockState {
  // Terminal phases ignore everything: a late biometric callback can never
  // re-run an unlock or resurrect a wiped session.
  if (state.phase === "unlocking" || state.phase === "signed_out") {
    return state;
  }

  switch (event.type) {
    case "START": {
      if (state.phase !== "starting") {
        return state;
      }
      if (event.lockedUntil !== null) {
        return {
          ...state,
          canUseBiometrics: event.canUseBiometrics,
          phase: "locked_out",
          lockedUntil: event.lockedUntil,
        };
      }
      if (event.canUseBiometrics) {
        return {
          ...state,
          canUseBiometrics: true,
          phase: "biometric",
          biometricRequestId: state.biometricRequestId + 1,
        };
      }
      return { ...state, canUseBiometrics: false, phase: "pin" };
    }

    case "REQUEST_BIOMETRIC": {
      if (
        !state.canUseBiometrics ||
        (state.phase !== "pin" && state.phase !== "locked_out")
      ) {
        return state;
      }
      return {
        ...state,
        phase: "biometric",
        message: null,
        pinError: null,
        biometricRequestId: state.biometricRequestId + 1,
      };
    }

    case "BIOMETRIC_SUCCESS":
      return state.phase === "biometric"
        ? { ...state, phase: "unlocking", message: null }
        : state;

    case "BIOMETRIC_FAILED":
      if (state.phase !== "biometric") {
        return state;
      }
      return {
        ...state,
        phase: state.lockedUntil !== null ? "locked_out" : "pin",
        message: event.message,
      };

    case "BIOMETRIC_UNAVAILABLE":
      if (state.phase !== "biometric" && state.phase !== "starting") {
        return { ...state, canUseBiometrics: false, message: event.message };
      }
      return {
        ...state,
        canUseBiometrics: false,
        phase: state.lockedUntil !== null ? "locked_out" : "pin",
        message: event.message,
      };

    case "USE_PIN":
      if (state.phase !== "starting" && state.phase !== "biometric") {
        return state;
      }
      return {
        ...state,
        phase: state.lockedUntil !== null ? "locked_out" : "pin",
      };

    case "PIN_SUBMITTED":
      return state.phase === "pin"
        ? { ...state, phase: "verifying", pinError: null }
        : state;

    case "PIN_SUCCESS":
      return state.phase === "verifying"
        ? { ...state, phase: "unlocking", pinError: null }
        : state;

    case "PIN_INCORRECT":
      if (state.phase !== "verifying") {
        return state;
      }
      return {
        ...state,
        phase: "pin",
        pinError: incorrectPinCopy(event.remaining),
        pinErrorId: state.pinErrorId + 1,
      };

    case "PIN_LOCKED":
      if (state.phase !== "verifying" && state.phase !== "pin") {
        return state;
      }
      return {
        ...state,
        phase: "locked_out",
        lockedUntil: event.until,
        pinError: null,
        pinErrorId: state.pinErrorId + 1,
      };

    case "LOCKOUT_EXPIRED":
      if (state.phase !== "locked_out") {
        return { ...state, lockedUntil: null };
      }
      return { ...state, phase: "pin", lockedUntil: null };

    case "PIN_WIPED":
      return { ...state, phase: "signed_out" };

    case "CLEAR_PIN_ERROR":
      return state.pinError ? { ...state, pinError: null } : state;

    default:
      return state;
  }
}

/** The PIN sheet is shown for every phase except the initial biometric attempt. */
export function isPinSheetVisible(state: UnlockState): boolean {
  return (
    state.phase === "pin" ||
    state.phase === "verifying" ||
    state.phase === "locked_out"
  );
}
