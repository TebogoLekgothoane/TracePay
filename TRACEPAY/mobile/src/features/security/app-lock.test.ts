import { randomBytes } from "node:crypto";

import {
  classifyRoute,
  decidePostAuth,
  decideRoute,
  nextBackgroundedAt,
  shouldLockOnResume,
  type GuardInput,
} from "./app-lock.policy";
import { resolveBiometricAvailability } from "./biometric.policy";
import {
  INITIAL_PIN_ATTEMPTS,
  lockoutRemainingMs,
  parsePinAttempts,
  registerPinFailure,
  type PinAttemptState,
} from "./pin-attempts";
import {
  createPinRecordWithSalt,
  isPinRecord,
  pinDigitsMatch,
  verifyPinRecord,
} from "./pin.crypto";
import {
  APP_LOCK_TIMEOUT,
  PIN_FREE_ATTEMPTS,
  PIN_MAX_ATTEMPTS,
} from "./security.constants";
import {
  initialUnlockState,
  isPinSheetVisible,
  unlockReducer,
  type UnlockEvent,
  type UnlockState,
} from "./unlock.machine";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const tests: { name: string; run: () => void | Promise<void> }[] = [];
function test(name: string, run: () => void | Promise<void>): void {
  tests.push({ name, run });
}

function run(state: UnlockState, ...events: UnlockEvent[]): UnlockState {
  return events.reduce(unlockReducer, state);
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

// ── Unlock state machine ────────────────────────────────────────────────

test("cold launch with biometrics auto-requests exactly one OS prompt", () => {
  const state = run(initialUnlockState, {
    type: "START",
    canUseBiometrics: true,
    lockedUntil: null,
  });
  assertEqual(state.phase, "biometric", "phase");
  assertEqual(state.biometricRequestId, 1, "one prompt requested");
  assertEqual(isPinSheetVisible(state), false, "no keypad before biometrics");

  const again = run(state, {
    type: "START",
    canUseBiometrics: true,
    lockedUntil: null,
  });
  assertEqual(again.biometricRequestId, 1, "repeated START does not re-prompt");
});

test("manual biometric retry is ignored while a prompt is in flight", () => {
  const state = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: true, lockedUntil: null },
    { type: "REQUEST_BIOMETRIC" },
    { type: "REQUEST_BIOMETRIC" },
  );
  assertEqual(state.biometricRequestId, 1, "no duplicate prompts");
});

test("biometric success unlocks", () => {
  const state = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: true, lockedUntil: null },
    { type: "BIOMETRIC_SUCCESS" },
  );
  assertEqual(state.phase, "unlocking", "phase");
});

test("biometric failure or cancellation falls back to the PIN sheet", () => {
  const state = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: true, lockedUntil: null },
    { type: "BIOMETRIC_FAILED", message: "cancelled" },
  );
  assertEqual(state.phase, "pin", "phase");
  assertEqual(isPinSheetVisible(state), true, "sheet visible");
  assertEqual(state.canUseBiometrics, true, "retry still allowed");
});

test("biometrics unavailable (removed or changed enrolment) disables retry", () => {
  const state = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: true, lockedUntil: null },
    { type: "BIOMETRIC_UNAVAILABLE", message: "changed" },
    { type: "REQUEST_BIOMETRIC" },
  );
  assertEqual(state.phase, "pin", "phase");
  assertEqual(state.canUseBiometrics, false, "biometrics off");
  assertEqual(state.biometricRequestId, 1, "no further prompts");
});

test("no biometrics goes straight to the PIN sheet", () => {
  const state = run(initialUnlockState, {
    type: "START",
    canUseBiometrics: false,
    lockedUntil: null,
  });
  assertEqual(state.phase, "pin", "phase");
  assertEqual(state.biometricRequestId, 0, "never prompts");
});

test("user can choose PIN before biometrics completes; late success is ignored", () => {
  const state = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: true, lockedUntil: null },
    { type: "USE_PIN" },
    { type: "BIOMETRIC_SUCCESS" },
  );
  assertEqual(state.phase, "pin", "late callback cannot change phase");
});

test("correct PIN unlocks; incorrect PIN shakes and allows retry", () => {
  const pin = run(initialUnlockState, {
    type: "START",
    canUseBiometrics: false,
    lockedUntil: null,
  });
  const wrong = run(
    pin,
    { type: "PIN_SUBMITTED" },
    { type: "PIN_INCORRECT", remaining: 3 },
  );
  assertEqual(wrong.phase, "pin", "back to entry");
  assertEqual(wrong.pinErrorId, 1, "error signalled");
  assert(Boolean(wrong.pinError?.includes("3 attempts")), "remaining shown");

  const ok = run(wrong, { type: "PIN_SUBMITTED" }, { type: "PIN_SUCCESS" });
  assertEqual(ok.phase, "unlocking", "unlocked");
});

test("PIN cannot be submitted twice concurrently", () => {
  const verifying = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: false, lockedUntil: null },
    { type: "PIN_SUBMITTED" },
  );
  const again = run(verifying, { type: "PIN_SUBMITTED" });
  assertEqual(again, verifying, "second submission ignored");
});

test("lockout blocks entry until it expires", () => {
  const locked = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: false, lockedUntil: null },
    { type: "PIN_SUBMITTED" },
    { type: "PIN_LOCKED", until: 1_000 },
    { type: "PIN_SUBMITTED" },
  );
  assertEqual(locked.phase, "locked_out", "submissions ignored while locked");
  assertEqual(run(locked, { type: "LOCKOUT_EXPIRED" }).phase, "pin", "unblocked");
});

test("a persisted lockout survives restart and biometrics stays usable", () => {
  const state = run(initialUnlockState, {
    type: "START",
    canUseBiometrics: true,
    lockedUntil: 5_000,
  });
  assertEqual(state.phase, "locked_out", "starts locked out");
  const retry = run(state, { type: "REQUEST_BIOMETRIC" });
  assertEqual(retry.phase, "biometric", "biometrics allowed during PIN lockout");
});

test("terminal phases ignore every later event", () => {
  const unlocked = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: true, lockedUntil: null },
    { type: "BIOMETRIC_SUCCESS" },
  );
  assertEqual(run(unlocked, { type: "BIOMETRIC_FAILED", message: "x" }), unlocked, "unlocking");

  const wiped = run(
    initialUnlockState,
    { type: "START", canUseBiometrics: false, lockedUntil: null },
    { type: "PIN_SUBMITTED" },
    { type: "PIN_WIPED" },
  );
  assertEqual(wiped.phase, "signed_out", "wiped");
  assertEqual(run(wiped, { type: "PIN_SUCCESS" }).phase, "signed_out", "stays signed out");
});

// ── PIN retry limits ────────────────────────────────────────────────────

test("first wrong PINs are free, then delays grow, then the PIN is wiped", () => {
  let state: PinAttemptState = INITIAL_PIN_ATTEMPTS;
  let now = 0;
  const outcomes: string[] = [];

  for (let attempt = 1; attempt <= PIN_MAX_ATTEMPTS; attempt += 1) {
    const result = registerPinFailure(state, now);
    state = result.state;
    outcomes.push(result.outcome.kind);
    if (result.outcome.kind === "locked") {
      now = result.outcome.until;
    }
  }

  assertEqual(
    outcomes.slice(0, PIN_FREE_ATTEMPTS - 1).every((kind) => kind === "retry"),
    true,
    "free attempts",
  );
  assertEqual(outcomes[PIN_FREE_ATTEMPTS - 1], "locked", "delay after free attempts");
  assertEqual(outcomes[PIN_MAX_ATTEMPTS - 1], "wipe", "wipe at max");
});

test("lockout delays increase", () => {
  let state: PinAttemptState = { failures: PIN_FREE_ATTEMPTS - 1, lockedUntil: null };
  const first = registerPinFailure(state, 0);
  state = first.state;
  const second = registerPinFailure(state, 0);
  assert(
    first.outcome.kind === "locked" &&
      second.outcome.kind === "locked" &&
      second.outcome.until > first.outcome.until,
    "second delay longer",
  );
  assertEqual(lockoutRemainingMs(second.state, 0) > 0, true, "remaining reported");
});

test("attempt counter round-trips storage and corrupt data does not reset it", () => {
  const stored = JSON.stringify({ failures: 7, lockedUntil: 123 });
  const parsed = parsePinAttempts(stored);
  assertEqual(parsed.failures, 7, "failures restored after restart");
  assertEqual(parsed.lockedUntil, 123, "lockout restored after restart");

  const corrupt = parsePinAttempts("{not json");
  assertEqual(corrupt.failures, PIN_MAX_ATTEMPTS - 1, "corruption fails closed");
  assertEqual(parsePinAttempts(null).failures, 0, "missing counter starts at zero");
});

// ── PIN verifier ────────────────────────────────────────────────────────

test("PIN verifier accepts the right PIN, rejects others, stores no plaintext", async () => {
  const record = await createPinRecordWithSalt([4, 8, 1, 5], randomBytes(16), USER_A);
  assertEqual(isPinRecord(record), true, "valid record");
  assertEqual(JSON.stringify(record).includes("4815"), false, "no plaintext PIN");
  assertEqual(record.userId, USER_A, "bound to user");
  assertEqual(await verifyPinRecord([4, 8, 1, 5], record), true, "correct PIN");
  assertEqual(await verifyPinRecord([4, 8, 1, 6], record), false, "wrong PIN");
  assertEqual(await verifyPinRecord([4, 8, 1], record), false, "short PIN");
  assertEqual(await verifyPinRecord([4, 8, 1, 10], record), false, "invalid digit");
});

test("same PIN with different salts gives different verifiers", async () => {
  const a = await createPinRecordWithSalt([1, 2, 3, 4], randomBytes(16), USER_A);
  const b = await createPinRecordWithSalt([1, 2, 3, 4], randomBytes(16), USER_A);
  assert(a.verifier !== b.verifier, "salted");
});

test("tampered or weakened records are rejected", async () => {
  const record = await createPinRecordWithSalt([1, 2, 3, 4], randomBytes(16), USER_A);
  assertEqual(isPinRecord({ ...record, iterations: 1 }), false, "low iterations");
  assertEqual(isPinRecord({ ...record, verifier: "00" }), false, "short verifier");
  assertEqual(
    await verifyPinRecord([1, 2, 3, 4], { ...record, iterations: 1 }),
    false,
    "weakened record never verifies",
  );
  assertEqual(pinDigitsMatch([1, 2, 3, 4], [1, 2, 3, 4]), true, "confirm match");
  assertEqual(pinDigitsMatch([1, 2, 3, 4], [1, 2, 3, 5]), false, "confirm mismatch");
});

// ── Backgrounding ───────────────────────────────────────────────────────

test("only real backgrounding counts toward the lock timeout", () => {
  assertEqual(nextBackgroundedAt("active", "inactive", null, 100), null, "Face ID sheet ignored");
  assertEqual(nextBackgroundedAt("inactive", "background", null, 200), 200, "background starts timer");
  assertEqual(nextBackgroundedAt("background", "inactive", 200, 300), 200, "keeps start");
  assertEqual(nextBackgroundedAt("background", "active", 200, 400), null, "cleared on resume");
});

test("resume locks only after the inactivity threshold and only with a PIN", () => {
  const base = { hasPin: true, backgroundedAt: 0, timeoutMs: APP_LOCK_TIMEOUT };
  assertEqual(shouldLockOnResume({ ...base, now: APP_LOCK_TIMEOUT - 1 }), false, "quick switch");
  assertEqual(shouldLockOnResume({ ...base, now: APP_LOCK_TIMEOUT }), true, "after threshold");
  assertEqual(
    shouldLockOnResume({ ...base, hasPin: false, now: APP_LOCK_TIMEOUT * 10 }),
    false,
    "no PIN, nothing to lock",
  );
  assertEqual(
    shouldLockOnResume({ ...base, backgroundedAt: null, now: APP_LOCK_TIMEOUT * 10 }),
    false,
    "inactive only",
  );
});

// ── Navigation guard and deep links ─────────────────────────────────────

function guard(segments: string[], overrides: Partial<GuardInput>) {
  return decideRoute({
    route: classifyRoute(segments),
    hasSession: true,
    hasPin: true,
    isLocked: true,
    ...overrides,
  });
}

test("locked app redirects every protected deep link to unlock", () => {
  const deepLinks = [
    ["(tabs)"],
    ["(tabs)", "transactions"],
    ["transactions", "[id]"],
    ["leak", "[id]"],
    ["settings", "security"],
    ["insights"],
    ["(auth)", "financial-accounts-setup"],
    ["(auth)", "some-future-screen"],
  ];
  for (const segments of deepLinks) {
    const decision = guard(segments, {});
    assert(
      decision.action === "redirect" && decision.to === "/(auth)/unlock",
      `${segments.join("/")} must redirect to unlock`,
    );
  }
});

test("locked app cannot reach PIN setup (no PIN replacement bypass)", () => {
  for (const screen of ["device-security", "confirm-pin", "biometric-setup"]) {
    const decision = guard(["(auth)", screen], {});
    assert(
      decision.action === "redirect" && decision.to === "/(auth)/unlock",
      `${screen} blocked while locked`,
    );
  }
});

test("locked app may show unlock, PIN reset explainer and server-verified sign-in", () => {
  for (const screen of ["unlock", "reset-pin", "otp"]) {
    assertEqual(guard(["(auth)", screen], {}).action, "stay", screen);
  }
});

test("expired or revoked session always requires account sign-in", () => {
  const decision = guard(["(tabs)"], { hasSession: false, isLocked: false });
  assert(
    decision.action === "redirect" && decision.to === "/(auth)/welcome",
    "no session → welcome even if unlocked",
  );
  const unlock = guard(["(auth)", "unlock"], { hasSession: false });
  assert(
    unlock.action === "redirect" && unlock.to === "/(auth)/welcome",
    "unlock screen is useless without a session",
  );
  assertEqual(guard(["(auth)", "welcome"], { hasSession: false }).action, "stay", "welcome");
});

test("signed-in user without a PIN must create one", () => {
  const decision = guard(["(tabs)"], { hasPin: false, isLocked: false });
  assert(
    decision.action === "redirect" && decision.to === "/(auth)/device-security",
    "PIN required",
  );
  assertEqual(
    guard(["(auth)", "device-security"], { hasPin: false }).action,
    "stay",
    "setup allowed",
  );
});

test("unlocked user leaves unlock/welcome for home and can open the app", () => {
  assertEqual(guard(["(auth)", "unlock"], { isLocked: false }).action, "home", "unlock → home");
  assertEqual(guard(["(auth)", "welcome"], { isLocked: false }).action, "home", "welcome → home");
  assertEqual(guard(["(tabs)"], { isLocked: false }).action, "stay", "tabs");
  assertEqual(
    guard(["(auth)", "device-security"], { isLocked: false }).action,
    "stay",
    "change PIN reachable when unlocked",
  );
});

// ── Post sign-in, logout and account switching ──────────────────────────

test("restored session or deep link to a post-login screen never unlocks", () => {
  const decision = decidePostAuth({
    freshlyAuthenticated: false,
    userId: USER_A,
    hasPin: true,
    pinOwnerId: USER_A,
  });
  assert(
    decision.action === "stay-locked" && decision.to === "/(auth)/unlock",
    "stays locked",
  );
});

test("fresh sign-in by the PIN owner unlocks; first login requires PIN setup", () => {
  assertEqual(
    decidePostAuth({ freshlyAuthenticated: true, userId: USER_A, hasPin: true, pinOwnerId: USER_A }).action,
    "unlock",
    "owner",
  );
  assertEqual(
    decidePostAuth({ freshlyAuthenticated: true, userId: USER_A, hasPin: false, pinOwnerId: null }).action,
    "create-pin",
    "first login / after logout",
  );
});

test("another account signing in never inherits the previous user's PIN", () => {
  assertEqual(
    decidePostAuth({ freshlyAuthenticated: true, userId: USER_B, hasPin: true, pinOwnerId: USER_A }).action,
    "replace-pin",
    "account switch",
  );
});

test("sign-in without a resolvable user stays on welcome", () => {
  const decision = decidePostAuth({
    freshlyAuthenticated: true,
    userId: null,
    hasPin: true,
    pinOwnerId: USER_A,
  });
  assert(
    decision.action === "stay-locked" && decision.to === "/(auth)/welcome",
    "welcome",
  );
});

// ── Biometric capability policy ─────────────────────────────────────────

const androidBase = {
  platform: "android",
  hasHardware: true,
  isEnrolled: true,
  hasFace: false,
  hasFingerprint: true,
  strongEnrolled: true,
};

test("Android accepts strong biometrics only", () => {
  assertEqual(resolveBiometricAvailability(androidBase).available, true, "strong fingerprint");
  const weakFace = resolveBiometricAvailability({
    ...androidBase,
    hasFace: true,
    hasFingerprint: false,
    strongEnrolled: false,
  });
  assertEqual(weakFace.available, false, "weak face unlock rejected");
  assertEqual(weakFace.unavailableReason, "weak_only", "reason");
  const both = resolveBiometricAvailability({ ...androidBase, hasFace: true });
  assertEqual(both.kind, "generic", "unknown strong modality gets generic label");
});

test("iOS maps Face ID and Touch ID", () => {
  const ios = { ...androidBase, platform: "ios", strongEnrolled: false };
  assertEqual(resolveBiometricAvailability({ ...ios, hasFace: true, hasFingerprint: false }).label, "Face ID", "Face ID");
  assertEqual(resolveBiometricAvailability(ios).label, "Touch ID", "Touch ID");
});

test("removed enrolment or missing hardware falls back to PIN", () => {
  assertEqual(
    resolveBiometricAvailability({ ...androidBase, isEnrolled: false }).unavailableReason,
    "not_enrolled",
    "not enrolled",
  );
  assertEqual(
    resolveBiometricAvailability({ ...androidBase, hasHardware: false }).unavailableReason,
    "no_hardware",
    "no hardware",
  );
});

void (async () => {
  for (const { name, run: runTest } of tests) {
    try {
      await runTest();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`fail - ${name}`);
      console.error(error);
      process.exit(1);
    }
  }
  console.log(`app lock tests passed (${tests.length})`);
})();
