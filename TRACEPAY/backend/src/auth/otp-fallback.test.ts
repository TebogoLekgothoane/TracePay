import assert from "node:assert/strict";

import { AuthHttpError } from "./auth.types.js";
import {
  assertAuthConfig,
  config,
  isProductionRuntime,
  otpFallbackAllowed,
} from "../config.js";

type MutableConfig = {
  authAllowOtpFallback: boolean;
  twilioVerifyServiceSid: string;
  twilioFrom: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  authResetTokenSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string;
};

const mutable = config as unknown as MutableConfig;

const ENV_KEYS = [
  "NODE_ENV",
  "AUTH_ENV",
  "RAILWAY_ENVIRONMENT",
  "RENDER",
  "RENDER_SERVICE_ID",
  "FLY_APP_NAME",
] as const;

const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const savedConfig = { ...mutable };

function restore(): void {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  Object.assign(mutable, savedConfig);
}

function clearProductionMarkers(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

function withFixture(run: () => void): void {
  try {
    clearProductionMarkers();
    mutable.supabaseUrl = "https://example.supabase.co";
    mutable.supabaseServiceRoleKey = "service-role-key-for-tests";
    mutable.supabaseAnonKey = "anon-key-for-tests";
    mutable.authResetTokenSecret = "tracepay-reset-token-secret-for-tests-32b";
    mutable.twilioAccountSid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    mutable.twilioAuthToken = "twilio-auth-token";
    mutable.twilioVerifyServiceSid = "";
    mutable.twilioFrom = "+15555550100";
    mutable.authAllowOtpFallback = false;
    run();
  } finally {
    restore();
  }
}

function test(name: string, run: () => void): void {
  try {
    withFixture(run);
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test("otp fallback is denied by default without Verify SID", () => {
  assert.equal(otpFallbackAllowed(), false);
  assert.throws(() => assertAuthConfig(), AuthHttpError);
});

test("otp fallback requires AUTH_ALLOW_OTP_FALLBACK outside production", () => {
  mutable.authAllowOtpFallback = true;
  assert.equal(otpFallbackAllowed(), true);
  assert.doesNotThrow(() => assertAuthConfig());
});

test("NODE_ENV=production blocks fallback even when the flag is set", () => {
  process.env.NODE_ENV = "production";
  mutable.authAllowOtpFallback = true;
  assert.equal(isProductionRuntime(), true);
  assert.equal(otpFallbackAllowed(), false);
  assert.throws(() => assertAuthConfig(), AuthHttpError);
});

test("AUTH_ENV=production blocks fallback without relying on NODE_ENV", () => {
  process.env.AUTH_ENV = "production";
  mutable.authAllowOtpFallback = true;
  assert.equal(isProductionRuntime(), true);
  assert.equal(otpFallbackAllowed(), false);
  assert.throws(() => assertAuthConfig(), AuthHttpError);
});

test("production without Verify SID fails closed", () => {
  process.env.NODE_ENV = "production";
  mutable.authAllowOtpFallback = false;
  assert.throws(() => assertAuthConfig(), AuthHttpError);
});

test("Verify SID allows production without fallback flag", () => {
  process.env.NODE_ENV = "production";
  mutable.twilioVerifyServiceSid = "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  mutable.authAllowOtpFallback = false;
  assert.equal(otpFallbackAllowed(), false);
  assert.doesNotThrow(() => assertAuthConfig());
});

test("AUTH_ALLOW_OTP_FALLBACK is rejected in production even with Verify SID", () => {
  process.env.AUTH_ENV = "production";
  mutable.twilioVerifyServiceSid = "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  mutable.authAllowOtpFallback = true;
  assert.throws(() => assertAuthConfig(), AuthHttpError);
});

console.log("otp-fallback config tests passed");
