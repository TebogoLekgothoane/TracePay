import { getAuthApiBaseUrl } from "../constants/config";
import { AUTH_API_TIMEOUT_MS } from "../features/auth/auth.constants";
import { AuthError } from "../features/auth/auth.errors";

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

export type AuthRequestOptions = {
  body?: Record<string, string>;
  accessToken?: string;
  timeoutMs?: number;
};

function isAuthRequestOptions(
  value: Record<string, string> | AuthRequestOptions,
): value is AuthRequestOptions {
  return (
    Object.prototype.hasOwnProperty.call(value, "body") ||
    Object.prototype.hasOwnProperty.call(value, "accessToken") ||
    Object.prototype.hasOwnProperty.call(value, "timeoutMs")
  );
}

export async function authRequest<T>(
  path: string,
  bodyOrOptions: Record<string, string> | AuthRequestOptions = {},
): Promise<T> {
  const options: AuthRequestOptions = isAuthRequestOptions(bodyOrOptions)
    ? bodyOrOptions
    : { body: bodyOrOptions };

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? AUTH_API_TIMEOUT_MS,
  );

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }

    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(options.body ?? {}),
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
