import Constants from "expo-constants";
import { Platform } from "react-native";

const DEV_AUTH_API_URL = "http://localhost:4001";
const DEV_PDF_PROCESSOR_URL = "http://localhost:8001";

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

function configuredPdfProcessorUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PDF_PROCESSOR_URL;
  const fromExtra = Constants.expoConfig?.extra?.pdfProcessorUrl;
  const value = [fromEnv, fromExtra].find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (typeof value === "string") {
    return value.trim();
  }

  if (__DEV__) {
    return DEV_PDF_PROCESSOR_URL;
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

/**
 * Rewrites loopback / Android-emulator hosts to a host the current device can
 * reach (Expo LAN IP, or 10.0.2.2 on Android emulators).
 */
function resolveDevReachableOrigin(origin: string): string {
  const normalized = origin.replace(/\/$/, "");
  if (!normalized) {
    return "";
  }

  const rewriteable =
    /^(https?:\/\/)(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?=[:/]|$)/i;
  if (!rewriteable.test(normalized)) {
    return normalized;
  }

  const lanHost = expoDevHost();
  if (lanHost) {
    return normalized.replace(rewriteable, `$1${lanHost}`);
  }

  if (Platform.OS === "android") {
    return normalized.replace(rewriteable, "$110.0.2.2");
  }

  return normalized;
}

export function getAuthApiBaseUrl(): string {
  return resolveDevReachableOrigin(configuredAuthApiUrl());
}

export function getPdfProcessorBaseUrl(): string {
  return resolveDevReachableOrigin(configuredPdfProcessorUrl());
}
