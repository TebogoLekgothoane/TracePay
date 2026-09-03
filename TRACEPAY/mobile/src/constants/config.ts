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

export function getAuthApiBaseUrl(): string {
  const origin = configuredAuthApiUrl().replace(/\/$/, "");
  if (!origin) {
    return "";
  }

  if (Platform.OS !== "android") {
    return origin;
  }

  return origin.replace(
    /^(https?:\/\/)(?:localhost|127\.0\.0\.1)(?=[:/]|$)/i,
    "$110.0.2.2",
  );
}
