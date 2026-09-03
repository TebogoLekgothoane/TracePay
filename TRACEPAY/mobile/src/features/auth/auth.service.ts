import { authRequest } from "../../api/auth.api";
import { AuthError } from "./auth.errors";
import type { SignInInput, SignInResult, SignUpInput } from "./auth.types";
import {
  isValidName,
  isValidPassword,
  isValidSaPhone,
  normalizeSaPhone,
} from "./auth.validation";

let pendingPhone: string | null = null;

export function getPendingPhone(): string | null {
  return pendingPhone;
}

export async function signUp({
  fullName,
  phone,
  password,
}: SignUpInput): Promise<void> {
  const trimmedName = fullName.trim();
  const normalizedPhone = normalizeSaPhone(phone);

  if (!isValidName(trimmedName)) {
    throw new AuthError("Enter your full name.");
  }
  if (!isValidSaPhone(phone)) {
    throw new AuthError("Enter a valid SA mobile number (9 digits after +27).");
  }
  if (!isValidPassword(password)) {
    throw new AuthError("Password must be at least 8 characters.");
  }

  await authRequest("/auth/register", {
    fullName: trimmedName,
    phone: normalizedPhone,
    password,
  });
  pendingPhone = normalizedPhone;
}

export async function signIn({
  phone,
  password,
}: SignInInput): Promise<SignInResult> {
  if (!isValidSaPhone(phone)) {
    throw new AuthError("Enter a valid SA mobile number (9 digits after +27).");
  }
  if (!password) {
    throw new AuthError("Enter your password.");
  }

  const normalizedPhone = normalizeSaPhone(phone);
  const result = await authRequest<SignInResult>("/auth/login", {
    phone: normalizedPhone,
    password,
  });

  if (result.requiresOtp) {
    pendingPhone = normalizedPhone;
  } else {
    pendingPhone = null;
  }

  return result;
}

export async function verifyPhoneOtp(code: string): Promise<void> {
  if (!pendingPhone) {
    throw new AuthError("Verification session expired. Please start again.");
  }

  await authRequest("/auth/verify-otp", {
    phone: pendingPhone,
    code,
  });
  pendingPhone = null;
}

export async function resendPhoneOtp(): Promise<void> {
  if (!pendingPhone) {
    throw new AuthError("Verification session expired. Please start again.");
  }

  await authRequest("/auth/resend-otp", { phone: pendingPhone });
}
