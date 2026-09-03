import Constants from "expo-constants";
import { Platform } from "react-native";

const DEV_AUTH_API_URL = "http://localhost:4001";

function configuredAuthApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  const value = [fromEnv, fromExtra].find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (typeof value === "string") {
    return value.trim();
  }

  if (__DEV__) {
    return DEV_AUTH_API_URL;
  }

  return "";
}

function expoDevHost(): string | undefined {
  const hostUri = Constants.expoConfig?.hostUri;
  if (typeof hostUri !== "string" || hostUri.trim().length === 0) {
    return undefined;
  }

  const host = hostUri.split(":")[0]?.trim();
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return undefined;
  }

  return host;
}

export function getAuthApiBaseUrl(): string {
  const origin = configuredAuthApiUrl().replace(/\/$/, "");
  if (!origin) {
    return "";
  }

  const loopback = /^(https?:\/\/)(?:localhost|127\.0\.0\.1)(?=[:/]|$)/i;
  if (!loopback.test(origin)) {
    return origin;
  }

  const lanHost = expoDevHost();
  if (lanHost) {
    return origin.replace(loopback, `$1${lanHost}`);
  }

  if (Platform.OS === "android") {
    return origin.replace(loopback, "$110.0.2.2");
  }

  return origin;
}
