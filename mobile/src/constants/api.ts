import AsyncStorage from "@react-native-async-storage/async-storage";

function resolveApiBase(): string {
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
  const key = "@tracepay:userId";
  let id = await AsyncStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(key, id);
  }
  return id;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const userId = await getUserId();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
      ...(options.headers ?? {}),
    },
  });
}
