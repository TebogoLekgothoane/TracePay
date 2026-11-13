import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesPackage,
} from "react-native-purchases";

import type { BillingProduct } from "../features/billing/billing.types";

/**
 * Thin wrapper over RevenueCat. The RevenueCat app user id is the Supabase user id, so the
 * backend can map store purchases back to an account. This module never decides access:
 * the backend re-reads the purchase from RevenueCat and answers with entitlements.
 *
 * Packages in the current offering must use the custom identifiers `full_analysis` and
 * `annual_monitoring` (the same names as BillingProduct).
 */
export class PurchaseCancelledError extends Error {
  constructor() {
    super("Purchase cancelled.");
    this.name = "PurchaseCancelledError";
  }
}

export class PurchaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseError";
  }
}

let configured = false;
let loggedInAs: string | null = null;

function apiKey(): string {
  const key =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return typeof key === "string" ? key.trim() : "";
}

export function isRevenueCatAvailable(): boolean {
  return (Platform.OS === "ios" || Platform.OS === "android") && apiKey().length > 0;
}

function describe(error: unknown): string {
  const code = (error as Partial<PurchasesError> | null)?.code;
  switch (code) {
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
      return "Could not reach the store. Check your connection and try again.";
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return "Purchases are not allowed on this device.";
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return "You already own this. Try restoring your purchases.";
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return "Your payment is pending. Access unlocks once the store confirms it.";
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
      return "The store had a problem. Please try again.";
    default:
      return "Could not complete the purchase. Please try again.";
  }
}

/** Configure once and make sure the SDK is acting for this signed-in user. */
export async function ensureRevenueCat(userId: string): Promise<void> {
  if (!isRevenueCatAvailable()) throw new PurchaseError("In-app purchases are not set up yet.");
  if (!configured) {
    if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: apiKey(), appUserID: userId });
    configured = true;
    loggedInAs = userId;
    return;
  }
  if (loggedInAs !== userId) {
    await Purchases.logIn(userId);
    loggedInAs = userId;
  }
}

/** Forget the user on sign-out so the next account never inherits this one's purchases. */
export async function resetRevenueCat(): Promise<void> {
  if (!configured || loggedInAs === null) return;
  loggedInAs = null;
  try {
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch {
    // Already anonymous or offline; the next logIn replaces the identity anyway.
  }
}

export type StorePrice = { priceString: string };

export async function loadStorePrices(
  userId: string,
): Promise<Partial<Record<BillingProduct, StorePrice>>> {
  await ensureRevenueCat(userId);
  const offerings = await Purchases.getOfferings();
  const prices: Partial<Record<BillingProduct, StorePrice>> = {};
  for (const pkg of offerings.current?.availablePackages ?? []) {
    if (pkg.identifier === "full_analysis" || pkg.identifier === "annual_monitoring") {
      prices[pkg.identifier] = { priceString: pkg.product.priceString };
    }
  }
  return prices;
}

async function packageFor(product: BillingProduct): Promise<PurchasesPackage> {
  const offerings = await Purchases.getOfferings();
  const found = offerings.current?.availablePackages.find((pkg) => pkg.identifier === product);
  if (!found) throw new PurchaseError("This plan is not available in the store right now.");
  return found;
}

export async function purchaseProduct(userId: string, product: BillingProduct): Promise<void> {
  await ensureRevenueCat(userId);
  const pkg = await packageFor(product);
  try {
    await Purchases.purchasePackage(pkg);
  } catch (error) {
    if ((error as Partial<PurchasesError> | null)?.userCancelled) throw new PurchaseCancelledError();
    throw new PurchaseError(describe(error));
  }
}

export async function restoreStorePurchases(userId: string): Promise<void> {
  await ensureRevenueCat(userId);
  try {
    await Purchases.restorePurchases();
  } catch (error) {
    throw new PurchaseError(describe(error));
  }
}
