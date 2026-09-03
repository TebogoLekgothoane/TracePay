import { getAuthApiBaseUrl } from "../constants/config";
import { AuthError } from "../features/auth/auth.errors";

const DEFAULT_TIMEOUT_MS = 15000;

function apiBaseUrl(): string {
  const value = getAuthApiBaseUrl();
  if (!value) {
    throw new AuthError("Auth API is not configured. Set EXPO_PUBLIC_API_URL.");
  }
  return value;
}
type ErrorBody = {
  error?: string;
};

export async function authRequest<T>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as ErrorBody & T;

    if (!response.ok) {
      throw new AuthError(
        typeof payload.error === "string"
          ? payload.error
          : "Something went wrong. Please try again.",
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AuthError("The request timed out. Please try again.");
    }
    throw new AuthError("Could not reach the auth server. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
}
