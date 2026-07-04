import AsyncStorage from "@react-native-async-storage/async-storage";

import { AUTH_KEYS } from "@/lib/auth-storage";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

function resolveApiBase(): string {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (backendUrl) {
    return backendUrl.replace(/\/$/, "");
  }

  const raw = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!raw) {
    return "http://localhost:8080/api";
  }

  const host = raw.replace(/^https?:\/\//i, "");
  const isLocal =
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1");
  const protocol = isLocal ? "http" : "https";
  return `${protocol}://${host}/api`;
}

export const API_BASE = resolveApiBase();

export async function getUserId(): Promise<string> {
  if (isSupabaseConfigured()) {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    if (session?.user.id) {
      return session.user.id;
    }
  }

  const storedId = await AsyncStorage.getItem(AUTH_KEYS.userId);
  if (storedId) {
    return storedId;
  }

  const fallbackId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await AsyncStorage.setItem(AUTH_KEYS.userId, fallbackId);
  return fallbackId;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const userId = await getUserId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-user-id": userId,
    ...(options.headers as Record<string, string> | undefined),
  };

  if (isSupabaseConfigured()) {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
}
