import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import twilio from "twilio";

import { assertAuthConfig, config } from "../config.js";
import {
  AuthHttpError,
  type SignInBody,
  type SignInResult,
  type SignUpBody,
  type VerifyOtpBody,
} from "./auth.types.js";

const PHONE = /^\+27\d{9}$/;

function normalizeSaPhone(phone: string): string {
  const digits = phone.replace(/\s/g, "");

  if (digits.startsWith("+27")) {
    return `+27${digits.slice(3).replace(/\D/g, "")}`;
  }
  if (digits.startsWith("27")) {
    return `+27${digits.slice(2).replace(/\D/g, "")}`;
  }
  if (digits.startsWith("0")) {
    return `+27${digits.slice(1).replace(/\D/g, "")}`;
  }

  return `+27${digits.replace(/\D/g, "")}`;
}

function requireValidPhone(phone: string): string {
  const normalized = normalizeSaPhone(phone);
  if (!PHONE.test(normalized)) {
    throw new AuthHttpError(400, "Enter a valid SA mobile number (9 digits after +27).");
  }
  return normalized;
}

function phoneDigits(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

let adminClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;
let twilioClient: ReturnType<typeof twilio> | null = null;

function getAdmin(): SupabaseClient {
  assertAuthConfig();
  if (!adminClient) {
    adminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

function getAuthClient(): SupabaseClient {
  assertAuthConfig();
  if (!authClient) {
    authClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return authClient;
}

function getTwilio() {
  assertAuthConfig();
  if (!twilioClient) {
    twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);
  }
  return twilioClient;
}

async function findUserByPhone(phone: string): Promise<User | undefined> {
  const client = getAdmin();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new AuthHttpError(500, "Could not look up that account.");
    }

    const match = data.users.find(
      (user) => phoneDigits(user.phone) === phoneDigits(phone),
    );
    if (match) {
      return match;
    }
    if (data.users.length < 200) {
      return undefined;
    }
    page += 1;
  }

  return undefined;
}

async function sendOtp(phone: string): Promise<void> {
  const client = getTwilio();

  try {
    if (config.twilioVerifyServiceSid) {
      await client.verify.v2
        .services(config.twilioVerifyServiceSid)
        .verifications.create({ to: phone, channel: "sms" });
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await client.messages.create({
      to: phone,
      from: config.twilioFrom,
      body: `Your TRACEPAY code is ${code}`,
    });
    pendingFallback.set(phone, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
  } catch (error) {
    console.error("[auth] Twilio SMS failed", error);
    throw twilioSendError(error);
  }
}

function twilioErrorCode(error: unknown): number {
  if (typeof error === "object" && error && "code" in error) {
    const code = Number((error as { code: unknown }).code);
    return Number.isFinite(code) ? code : 0;
  }
  return 0;
}

function twilioSendError(error: unknown): AuthHttpError {
  switch (twilioErrorCode(error)) {
    case 21608:
      return new AuthHttpError(
        400,
        "This phone number is not verified on the Twilio trial account. Add it in Twilio under Verified Caller IDs, or upgrade the account.",
      );
    case 21614:
      return new AuthHttpError(400, "Twilio cannot send SMS to this number.");
    case 60200:
      return new AuthHttpError(400, "Twilio rejected this phone number.");
    case 60203:
      return new AuthHttpError(429, "Too many SMS attempts. Wait a few minutes and try again.");
    default:
      return new AuthHttpError(
        502,
        "Could not send the verification SMS. Check Twilio credentials on the backend.",
      );
  }
}

const pendingFallback = new Map<string, { code: string; expiresAt: number }>();

async function checkOtp(phone: string, code: string): Promise<void> {
  const token = code.replace(/\s/g, "");
  if (token.length < 6) {
    throw new AuthHttpError(400, "Enter the 6-digit code from your SMS.");
  }

  if (config.twilioVerifyServiceSid) {
    try {
      const result = await getTwilio()
        .verify.v2.services(config.twilioVerifyServiceSid)
        .verificationChecks.create({ to: phone, code: token });

      if (result.status !== "approved") {
        throw new AuthHttpError(400, "Invalid verification code. Please try again.");
      }
      return;
    } catch (error) {
      if (error instanceof AuthHttpError) {
        throw error;
      }
      throw new AuthHttpError(400, "Invalid verification code. Please try again.");
    }
  }

  const pending = pendingFallback.get(phone);
  if (!pending || pending.expiresAt < Date.now() || pending.code !== token) {
    throw new AuthHttpError(400, "Invalid verification code. Please try again.");
  }
  pendingFallback.delete(phone);
}

export async function register(body: SignUpBody): Promise<void> {
  const fullName = body.fullName.trim();
  const phone = requireValidPhone(body.phone);
  const password = body.password;

  if (fullName.length < 2) {
    throw new AuthHttpError(400, "Enter your full name.");
  }
  if (password.length < 8) {
    throw new AuthHttpError(400, "Password must be at least 8 characters.");
  }

  const existing = await findUserByPhone(phone);
  if (existing) {
    throw new AuthHttpError(409, "This phone number is already registered. Log in instead.");
  }

  await sendOtp(phone);

  const { error } = await getAdmin().auth.admin.createUser({
    phone,
    password,
    phone_confirm: false,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      throw new AuthHttpError(409, "This phone number is already registered. Log in instead.");
    }
    throw new AuthHttpError(400, error.message);
  }
}

export async function login(body: SignInBody): Promise<SignInResult> {
  const phone = requireValidPhone(body.phone);
  if (!body.password) {
    throw new AuthHttpError(400, "Enter your password.");
  }

  const { data, error } = await getAuthClient().auth.signInWithPassword({
    phone,
    password: body.password,
  });

  if (error || !data.session) {
    const user = await findUserByPhone(phone);
    if (user && !user.phone_confirmed_at) {
      await sendOtp(phone);
      return { requiresOtp: true, session: null };
    }
    throw new AuthHttpError(401, "Incorrect phone number or password.");
  }

  return {
    requiresOtp: false,
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
  };
}

export async function verifyOtp(body: VerifyOtpBody): Promise<void> {
  const phone = requireValidPhone(body.phone);
  await checkOtp(phone, body.code);

  const user = await findUserByPhone(phone);
  if (!user) {
    throw new AuthHttpError(400, "Verification session expired. Please start again.");
  }

  const { error } = await getAdmin().auth.admin.updateUserById(user.id, {
    phone_confirm: true,
  });

  if (error) {
    throw new AuthHttpError(400, "Could not confirm this phone number.");
  }
}

export async function resendOtp(phoneValue: string): Promise<void> {
  const phone = requireValidPhone(phoneValue);
  await sendOtp(phone);
}
