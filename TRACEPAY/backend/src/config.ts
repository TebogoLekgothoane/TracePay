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

export const config = {
  port: Number(read("AUTH_PORT") || "4001"),
  supabaseUrl: read("SUPABASE_URL"),
  supabaseServiceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: read("SUPABASE_ANON_KEY"),
  twilioAccountSid: read("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: read("TWILIO_AUTH_TOKEN"),
  twilioVerifyServiceSid: read("TWILIO_VERIFY_SERVICE_SID"),
  twilioFrom: read("TWILIO_FROM"),
};

export function assertSupabaseConfig(): void {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey || !config.supabaseAnonKey) {
    throw new AuthHttpError(
      503,
      "Auth server is missing Supabase keys. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in TRACEPAY/backend/.env.",
    );
  }
}

export function assertAuthConfig(): void {
  assertSupabaseConfig();

  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new AuthHttpError(
      503,
      "Auth server is missing Twilio credentials. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in TRACEPAY/backend/.env.",
    );
  }
  if (!config.twilioVerifyServiceSid && !config.twilioFrom) {
    throw new AuthHttpError(
      503,
      "Auth server cannot send SMS. Set TWILIO_VERIFY_SERVICE_SID or TWILIO_FROM in TRACEPAY/backend/.env.",
    );
  }
}
