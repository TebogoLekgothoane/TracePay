import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import twilio from "twilio";

import { assertAuthConfig, config, otpFallbackAllowed } from "../config.js";
import { getAdminClient, getUserClient } from "../supabase.js";
import {
  AuthHttpError,
  type AuthSession,
  type ResetPasswordBody,
  type SignInBody,
  type SignInResult,
  type SignUpBody,
  type VerifyOtpBody,
} from "./auth.types.js";
import { createResetToken, consumeResetToken } from "./reset-token.js";

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

let twilioClient: ReturnType<typeof twilio> | null = null;

function getAdmin() {
  return getAdminClient();
}

function getAuthClient() {
  return getUserClient();
}

function getTwilio() {
  assertAuthConfig();
  if (!twilioClient) {
    twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);
  }
  return twilioClient;
}

async function findUserByPhone(phone: string): Promise<User | undefined> {
  const { data, error } = await getAdmin()
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    throw new AuthHttpError(500, "Could not look up that account.");
  }
  if (!data?.id || typeof data.id !== "string") {
    return undefined;
  }

  const { data: userData, error: userError } = await getAdmin().auth.admin.getUserById(data.id);
  if (userError || !userData.user) {
    return undefined;
  }
  return userData.user;
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

    if (!otpFallbackAllowed()) {
      throw new AuthHttpError(
        503,
        "OTP fallback is disabled. Set TWILIO_VERIFY_SERVICE_SID, or AUTH_ALLOW_OTP_FALLBACK=true for local development only.",
      );
    }

    const code = String(randomInt(100000, 1000000));
    await client.messages.create({
      to: phone,
      from: config.twilioFrom,
      body: `Your TRACEPAY code is ${code}`,
    });
    pendingFallback.set(phone, { codeHash: hashOtp(code), expiresAt: Date.now() + OTP_TTL_MS });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      throw error;
    }
    console.error("[auth] Twilio SMS failed", { code: twilioErrorCode(error) });
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

const OTP_TTL_MS = 10 * 60 * 1000;
const FORGOT_COOLDOWN_MS = 30 * 1000;
const pendingFallback = new Map<string, { codeHash: string; expiresAt: number }>();
const lastForgotAt = new Map<string, number>();

function hashOtp(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

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

  if (!otpFallbackAllowed()) {
    throw new AuthHttpError(
      503,
      "OTP fallback is disabled. Set TWILIO_VERIFY_SERVICE_SID, or AUTH_ALLOW_OTP_FALLBACK=true for local development only.",
    );
  }

  const pending = pendingFallback.get(phone);
  if (!pending || pending.expiresAt < Date.now() || !codesEqual(pending.codeHash, hashOtp(token))) {
    throw new AuthHttpError(400, "Invalid verification code. Please try again.");
  }
  pendingFallback.delete(phone);
}

function codesEqual(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
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

  await sendOtp(phone);
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
      // Do not send OTP on a failed password attempt. Client must use rate-limited /auth/resend-otp.
      return { requiresOtp: true, session: null };
    }
    throw new AuthHttpError(401, "Incorrect phone number or password.");
  }

  return {
    requiresOtp: false,
    session: toAuthSession(data.session),
  };
}

function toAuthSession(session: {
  access_token: string;
  refresh_token: string;
}): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

async function createPasswordSession(
  phone: string,
  password: string,
): Promise<AuthSession> {
  const { data, error } = await getAuthClient().auth.signInWithPassword({
    phone,
    password,
  });

  if (error || !data.session) {
    throw new AuthHttpError(401, "Phone verified. Log in with your password.");
  }

  return toAuthSession(data.session);
}

export async function verifyOtp(body: VerifyOtpBody): Promise<SignInResult> {
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

  const password = body.password?.trim() ?? "";
  if (body.purpose === "reset") {
    return { requiresOtp: false, session: null, resetAllowed: true, resetToken: createResetToken(user.id, phone) };
  }

  if (!password) {
    return { requiresOtp: false, session: null };
  }

  return {
    requiresOtp: false,
    session: await createPasswordSession(phone, password),
  };
}

export async function forgotPassword(phoneValue: string): Promise<void> {
  const phone = requireValidPhone(phoneValue);
  const lastSent = lastForgotAt.get(phone) ?? 0;
  if (Date.now() - lastSent < FORGOT_COOLDOWN_MS) {
    throw new AuthHttpError(429, "Wait a moment before requesting another code.");
  }

  lastForgotAt.set(phone, Date.now());

  const user = await findUserByPhone(phone);
  if (!user) {
    return;
  }

  await sendOtp(phone);
}

export async function resetPassword(body: ResetPasswordBody): Promise<SignInResult> {
  const phone = requireValidPhone(body.phone);
  const password = body.password;

  if (password.length < 8) {
    throw new AuthHttpError(400, "Password must be at least 8 characters.");
  }
  if (!body.resetToken) {
    throw new AuthHttpError(400, "Verification session expired. Please start again.");
  }

  const userId = consumeResetToken(body.resetToken, phone);
  const { error } = await getAdmin().auth.admin.updateUserById(userId, {
    password,
    phone_confirm: true,
  });

  if (error) {
    throw new AuthHttpError(400, "Could not update your password. Please try again.");
  }

  return {
    requiresOtp: false,
    session: await createPasswordSession(phone, password),
  };
}

export async function resendOtp(phoneValue: string): Promise<void> {
  const phone = requireValidPhone(phoneValue);
  const user = await findUserByPhone(phone);
  if (!user) {
    return;
  }
  await sendOtp(phone);
}
