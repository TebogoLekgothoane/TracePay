import { authRequest } from "../../api/auth.api";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { AuthError } from "./auth.errors";
import type { SignInInput, SignInResult, SignUpInput } from "./auth.types";
import {
  isValidName,
  isValidPassword,
  isValidSaPhone,
  normalizeSaPhone,
} from "./auth.validation";

let pendingPhone: string | null = null;

type SessionListener = (present: boolean) => void;
const sessionListeners = new Set<SessionListener>();

function emitSessionPresence(present: boolean): void {
  for (const listener of sessionListeners) {
    listener(present);
  }
}

export function subscribeSessionPresence(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

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

async function persistSession(session: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new AuthError(
      "Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const { data, error } = await getSupabase().auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  if (error || !data.session?.access_token) {
    throw new AuthError("Could not save your session. Please try again.");
  }

  emitSessionPresence(true);
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
    return result;
  }

  pendingPhone = null;

  if (!result.session) {
    throw new AuthError("Login succeeded but no session was returned.");
  }

  await persistSession(result.session);
  return result;
}

function resolvePendingPhone(phone?: string): string {
  const raw = phone?.trim() || pendingPhone;
  if (!raw) {
    throw new AuthError("Verification session expired. Please start again.");
  }

  const normalized = normalizeSaPhone(raw);
  pendingPhone = normalized;
  return normalized;
}

export async function verifyPhoneOtp(code: string, phone?: string): Promise<void> {
  const target = resolvePendingPhone(phone);

  await authRequest("/auth/verify-otp", {
    phone: target,
    code,
  });
  pendingPhone = null;
}

export async function resendPhoneOtp(phone?: string): Promise<void> {
  const target = resolvePendingPhone(phone);
  await authRequest("/auth/resend-otp", { phone: target });
}

export async function getAuthSession(): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token || !data.session.refresh_token) {
    return null;
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

export async function hasAuthSession(): Promise<boolean> {
  return (await getAuthSession()) !== null;
}

export async function signOut(): Promise<void> {
  pendingPhone = null;
  emitSessionPresence(false);

  if (!isSupabaseConfigured()) {
    return;
  }

  try {
    await getSupabase().auth.signOut();
  } catch {
    return;
  }
}
