import { authRequest } from "../../api/auth.api";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import {
  DEFAULT_PROFILE_CURRENCY,
  FALLBACK_PROFILE_NAME,
} from "./auth.constants";
import { AuthError } from "./auth.errors";
import {
  getProfileSnapshot,
  resetProfileSnapshot,
  setProfileSnapshot,
} from "./auth.store";
import type {
  AuthProfile,
  SignInInput,
  SignInResult,
  SignUpInput,
} from "./auth.types";
import {
  isValidName,
  isValidPassword,
  isValidSaPhone,
  normalizeSaPhone,
} from "./auth.validation";

let pendingPhone: string | null = null;
let pendingPassword: string | null = null;
let pendingPurpose: "signup" | "login" | "reset" | null = null;
let profileRequest: Promise<AuthProfile | null> | null = null;

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

function rememberPendingCredentials(
  phone: string,
  password: string | null,
  purpose: "signup" | "login" | "reset",
): void {
  pendingPhone = phone;
  pendingPassword = password;
  pendingPurpose = purpose;
}

function clearPendingCredentials(): void {
  pendingPhone = null;
  pendingPassword = null;
  pendingPurpose = null;
}

function readAuthSession(
  value: unknown,
): { accessToken: string; refreshToken: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const session = value as {
    accessToken?: unknown;
    refreshToken?: unknown;
  };

  if (
    typeof session.accessToken !== "string" ||
    session.accessToken.length === 0 ||
    typeof session.refreshToken !== "string" ||
    session.refreshToken.length === 0
  ) {
    return null;
  }

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

function readSignInResult(value: unknown): SignInResult {
  if (!value || typeof value !== "object") {
    throw new AuthError("Invalid response from the auth server.");
  }

  const body = value as {
    requiresOtp?: unknown;
    resetAllowed?: unknown;
    session?: unknown;
  };
  return {
    requiresOtp: body.requiresOtp === true,
    resetAllowed: body.resetAllowed === true,
    session: readAuthSession(body.session),
  };
}

function readMetadataName(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const fullName = (metadata as { full_name?: unknown }).full_name;
  return typeof fullName === "string" ? fullName.trim() : "";
}

function readProfileRow(
  value: unknown,
): { id: string; fullName: string; currency: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as {
    id?: unknown;
    full_name?: unknown;
    currency?: unknown;
  };

  if (typeof row.id !== "string" || row.id.length === 0) {
    return null;
  }

  return {
    id: row.id,
    fullName: typeof row.full_name === "string" ? row.full_name.trim() : "",
    currency: typeof row.currency === "string" && row.currency.length === 3
      ? row.currency
      : DEFAULT_PROFILE_CURRENCY,
  };
}

async function ensureProfileRow(
  userId: string,
  fullName: string,
): Promise<{ id: string; fullName: string; currency: string } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, currency")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new AuthError("Could not load your profile. Please try again.");
  }

  const existing = readProfileRow(data);
  if (existing) {
    return existing;
  }

  const { error: upsertError } = await supabase.from("profiles").upsert(
    { id: userId, full_name: fullName },
    { onConflict: "id" },
  );

  if (upsertError) {
    throw new AuthError("Could not connect your profile. Please try again.");
  }

  const { data: created, error: reloadError } = await supabase
    .from("profiles")
    .select("id, full_name, currency")
    .eq("id", userId)
    .maybeSingle();

  if (reloadError) {
    throw new AuthError("Could not load your profile. Please try again.");
  }

  return readProfileRow(created);
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

  try {
    const row = await ensureProfileRow(
      data.session.user.id,
      readMetadataName(data.session.user.user_metadata),
    );
    if (row) {
      setProfileSnapshot({
        profile: {
          id: row.id,
          fullName:
            row.fullName ||
            readMetadataName(data.session.user.user_metadata) ||
            FALLBACK_PROFILE_NAME,
          phone: typeof data.session.user.phone === "string"
            ? data.session.user.phone
            : null,
          currency: row.currency,
        },
        loading: false,
        error: null,
      });
    }
  } catch {
    setProfileSnapshot({
      profile: null,
      loading: false,
      error: null,
    });
  }
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
  rememberPendingCredentials(normalizedPhone, password, "signup");
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
  const result = readSignInResult(
    await authRequest<unknown>("/auth/login", {
      phone: normalizedPhone,
      password,
    }),
  );

  if (result.requiresOtp) {
    rememberPendingCredentials(normalizedPhone, password, "login");
    return result;
  }

  clearPendingCredentials();

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

export async function requestPasswordReset(phone: string): Promise<void> {
  if (!isValidSaPhone(phone)) {
    throw new AuthError("Enter a valid SA mobile number (9 digits after +27).");
  }

  const normalizedPhone = normalizeSaPhone(phone);
  await authRequest("/auth/forgot-password", { phone: normalizedPhone });
  rememberPendingCredentials(normalizedPhone, null, "reset");
}

export async function resetPassword(password: string, phone?: string): Promise<void> {
  if (!isValidPassword(password)) {
    throw new AuthError("Password must be at least 8 characters.");
  }

  const target = resolvePendingPhone(phone);
  if (pendingPurpose !== "reset") {
    throw new AuthError("Verification session expired. Please start again.");
  }

  const result = readSignInResult(
    await authRequest<unknown>("/auth/reset-password", {
      phone: target,
      password,
    }),
  );

  if (!result.session) {
    throw new AuthError("Password updated. Log in with your new password.");
  }

  await persistSession(result.session);
  clearPendingCredentials();
}

export async function verifyPhoneOtp(code: string, phone?: string): Promise<void> {
  const target = resolvePendingPhone(phone);
  const body: Record<string, string> = {
    phone: target,
    code,
  };

  if (pendingPurpose === "reset") {
    body.purpose = "reset";
  } else if (pendingPassword) {
    body.password = pendingPassword;
  }

  const result = readSignInResult(
    await authRequest<unknown>("/auth/verify-otp", body),
  );

  if (result.resetAllowed) {
    pendingPassword = null;
    pendingPurpose = "reset";
    return;
  }

  if (!result.session) {
    clearPendingCredentials();
    throw new AuthError("Phone verified. Log in with your password.");
  }

  await persistSession(result.session);
  clearPendingCredentials();
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

export async function getCurrentProfile(): Promise<AuthProfile | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return null;
  }

  const user = userData.user;
  const metadataName = readMetadataName(user.user_metadata);
  const row = await ensureProfileRow(user.id, metadataName);

  if (!row) {
    throw new AuthError("Could not load your profile. Please try again.");
  }

  const profile = {
    id: row.id,
    fullName: row.fullName || metadataName || FALLBACK_PROFILE_NAME,
    phone: typeof user.phone === "string" ? user.phone : null,
    currency: row.currency,
  };
  return profile;
}

export async function loadCurrentProfile(fresh = false): Promise<AuthProfile | null> {
  const current = getProfileSnapshot();
  if (!fresh && current.profile && !current.error) {
    return current.profile;
  }
  if (profileRequest) {
    return profileRequest;
  }

  setProfileSnapshot({
    profile: current.profile,
    loading: true,
    error: null,
  });

  profileRequest = getCurrentProfile()
    .then((profile) => {
      setProfileSnapshot({ profile, loading: false, error: null });
      return profile;
    })
    .catch((caught) => {
      setProfileSnapshot({
        profile: current.profile,
        loading: false,
        error:
          caught instanceof AuthError
            ? caught.message
            : "Could not load your profile. Please try again.",
      });
      return current.profile;
    })
    .finally(() => {
      profileRequest = null;
    });

  return profileRequest;
}

export async function signOut(): Promise<void> {
  clearPendingCredentials();
  profileRequest = null;
  resetProfileSnapshot();

  if (isSupabaseConfigured()) {
    const { error } = await getSupabase().auth.signOut();
    if (error) {
      await getSupabase().auth.signOut({ scope: "local" });
    }
  }

  emitSessionPresence(false);
}
