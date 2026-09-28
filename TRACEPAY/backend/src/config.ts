import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AuthHttpError } from "./auth/auth.types.js";

loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env"),
  override: true,
});

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

function readOriginList(name: string): string[] {
  return read(name)
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isTruthyFlag(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/** Decode the JWT payload role claim without verifying the signature (key classification only). */
export function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Production is any explicit production marker — not NODE_ENV alone.
 * Fail closed when markers are present; OTP fallback must never rely on NODE_ENV being unset.
 */
export function isProductionRuntime(): boolean {
  const nodeEnv = read("NODE_ENV").toLowerCase();
  const authEnv = read("AUTH_ENV").toLowerCase();
  if (nodeEnv === "production" || authEnv === "production") {
    return true;
  }
  // Common host signals that mean a live deploy even if NODE_ENV was forgotten.
  if (read("RAILWAY_ENVIRONMENT").toLowerCase() === "production") {
    return true;
  }
  if (isTruthyFlag(read("RENDER")) && read("RENDER_SERVICE_ID").length > 0) {
    return true;
  }
  if (read("FLY_APP_NAME").length > 0 && nodeEnv !== "development" && nodeEnv !== "test") {
    return true;
  }
  return false;
}

export const config = {
  port: Number(read("AUTH_PORT") || "4001"),
  supabaseUrl: read("SUPABASE_URL"),
  supabaseServiceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: read("SUPABASE_ANON_KEY"),
  authResetTokenSecret: read("AUTH_RESET_TOKEN_SECRET"),
  /** Dev-only: in-process OTP when TWILIO_VERIFY_SERVICE_SID is unset. Never valid in production. */
  authAllowOtpFallback: isTruthyFlag(read("AUTH_ALLOW_OTP_FALLBACK")),
  twilioAccountSid: read("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: read("TWILIO_AUTH_TOKEN"),
  twilioVerifyServiceSid: read("TWILIO_VERIFY_SERVICE_SID"),
  twilioFrom: read("TWILIO_FROM"),
  corsOrigins: readOriginList("AUTH_CORS_ORIGINS"),
};

/** True only when Verify SID is missing and an explicit non-production fallback is allowed. */
export function otpFallbackAllowed(): boolean {
  if (config.twilioVerifyServiceSid) {
    return false;
  }
  if (isProductionRuntime()) {
    return false;
  }
  return config.authAllowOtpFallback;
}

export function assertSupabaseConfig(): void {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey || !config.supabaseAnonKey) {
    throw new AuthHttpError(
      503,
      "Auth server is missing Supabase keys. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in TRACEPAY/backend/.env.",
    );
  }
  if (config.supabaseAnonKey === config.supabaseServiceRoleKey) {
    throw new AuthHttpError(
      503,
      "SUPABASE_ANON_KEY must be the publishable/anon key. It currently matches SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (jwtRole(config.supabaseAnonKey) === "service_role") {
    throw new AuthHttpError(
      503,
      "SUPABASE_ANON_KEY must be the publishable/anon key, not a service-role key.",
    );
  }
  if (jwtRole(config.supabaseServiceRoleKey) === "anon") {
    throw new AuthHttpError(
      503,
      "SUPABASE_SERVICE_ROLE_KEY must be the service-role key, not the publishable/anon key.",
    );
  }
}

export function assertAuthConfig(): void {
  assertSupabaseConfig();

  if (config.authResetTokenSecret.length < 32) {
    throw new AuthHttpError(
      503,
      "Auth server is missing AUTH_RESET_TOKEN_SECRET. Set a secret of at least 32 characters in TRACEPAY/backend/.env.",
    );
  }
  if (
    config.authResetTokenSecret === config.supabaseServiceRoleKey ||
    config.authResetTokenSecret === config.supabaseAnonKey
  ) {
    throw new AuthHttpError(
      503,
      "AUTH_RESET_TOKEN_SECRET must be a dedicated secret. Do not reuse SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.",
    );
  }

  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new AuthHttpError(
      503,
      "Auth server is missing Twilio credentials. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in TRACEPAY/backend/.env.",
    );
  }

  if (isProductionRuntime() && config.authAllowOtpFallback) {
    throw new AuthHttpError(
      503,
      "AUTH_ALLOW_OTP_FALLBACK cannot be enabled in production. Configure TWILIO_VERIFY_SERVICE_SID instead.",
    );
  }

  if (!config.twilioVerifyServiceSid) {
    if (isProductionRuntime()) {
      throw new AuthHttpError(
        503,
        "Production auth requires TWILIO_VERIFY_SERVICE_SID so OTP codes are not stored in the auth process.",
      );
    }
    if (!config.authAllowOtpFallback) {
      throw new AuthHttpError(
        503,
        "OTP fallback is disabled. Set TWILIO_VERIFY_SERVICE_SID, or AUTH_ALLOW_OTP_FALLBACK=true for local development only.",
      );
    }
    if (!config.twilioFrom) {
      throw new AuthHttpError(
        503,
        "Auth server cannot send SMS via OTP fallback. Set TWILIO_FROM (or configure TWILIO_VERIFY_SERVICE_SID).",
      );
    }
  }
}
