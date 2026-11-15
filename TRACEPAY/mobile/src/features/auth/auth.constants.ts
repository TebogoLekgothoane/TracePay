export const AUTH_API_TIMEOUT_MS = 15_000;
/** Account deletion may clear storage objects before cascading DB rows. */
export const AUTH_DELETE_ACCOUNT_TIMEOUT_MS = 45_000;
export const FALLBACK_PROFILE_NAME = "TracePay user";
export const DEFAULT_PROFILE_CURRENCY = "ZAR";
export const PROFILE_NAME_MAX_LENGTH = 80;
export const PROFILE_CURRENCIES = ["ZAR", "USD", "EUR", "GBP"] as const;
export type ProfileCurrency = (typeof PROFILE_CURRENCIES)[number];
export const SUPPORT_EMAIL = "support@tracepay.app";
