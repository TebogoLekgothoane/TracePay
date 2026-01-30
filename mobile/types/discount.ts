/**
 * User discount/reward from retailers – unlocked the more they use the app.
 */

export interface UserDiscount {
  id: string;
  retailer: string;
  title: string;
  description: string;
  /** e.g. "10% off", "R50 off", "Buy 1 get 1" */
  discountValue: string;
  /** Optional promo code to use at checkout */
  code?: string;
  /** How the user unlocked this (e.g. "After 2 analyses") */
  earnedFrom: string;
  /** ISO date string; optional expiry */
  expiresAt?: string;
  /** Tier: more usage = better rewards */
  tier: "bronze" | "silver" | "gold";
}
