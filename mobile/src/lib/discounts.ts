/**
 * User discounts/rewards from retailers – data from Supabase (discounts table).
 * The more the user uses the app, the more rewards can be unlocked (user_discounts).
 */

import type { UserDiscount } from "@/types/discount";
import { fetchDiscounts, type DiscountRow } from "./api";

function rowToUserDiscount(row: DiscountRow): UserDiscount {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + (row.expires_days ?? 30));
  return {
    id: row.id,
    retailer: row.retailer,
    title: row.title,
    description: row.description,
    discountValue: row.discount_value,
    code: row.code ?? undefined,
    earnedFrom: row.earned_from,
    expiresAt: expiresAt.toISOString().split("T")[0],
    tier: row.tier as UserDiscount["tier"],
  };
}

/** Fetch discounts from the database. Optionally filter by user's unlocked rewards later. */
export async function getDiscountsForUser(_userId?: string): Promise<UserDiscount[]> {
  const rows = await fetchDiscounts();
  return rows.map(rowToUserDiscount);
}
