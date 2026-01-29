import { supabase, DEMO_USER_ID } from "./supabase";
import type { AnalysisData, Subscription, Language } from "@/types/navigation";

// ---------------------------------------------------------------------------
// NOTE: This file talks to Supabase only (app state: settings, banks, etc.).
// For backend API calls (Open Banking, analysis, mobile freeze), use
// lib/backend-client.ts and set EXPO_PUBLIC_BACKEND_URL to the deployed
// FastAPI/Node backend. Open Banking API integration is expected from another
// team member; see docs/ARCHITECTURE.md.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// User settings
// ---------------------------------------------------------------------------

export interface UserSettingsRow {
  user_id: string;
  language: string;
  include_momo_data: boolean;
  airtime_limit: number;
}

export async function fetchUserSettings(
  userId: string = DEMO_USER_ID
): Promise<UserSettingsRow | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return data as UserSettingsRow;
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<Pick<UserSettingsRow, "language" | "include_momo_data" | "airtime_limit">>
): Promise<boolean> {
  const { error } = await supabase
    .from("user_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return !error;
}

// ---------------------------------------------------------------------------
// Freeze settings
// ---------------------------------------------------------------------------

export interface FreezeSettingsRow {
  pause_debit_orders: boolean;
  block_fee_accounts: boolean;
  set_airtime_limit: boolean;
  cancel_subscriptions: boolean;
}

export async function fetchFreezeSettings(
  userId: string = DEMO_USER_ID
): Promise<FreezeSettingsRow | null> {
  const { data, error } = await supabase
    .from("freeze_settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return data as FreezeSettingsRow;
}

export async function updateFreezeSettings(
  userId: string,
  settings: FreezeSettingsRow
): Promise<boolean> {
  const { error } = await supabase
    .from("freeze_settings")
    .upsert(
      { user_id: userId, ...settings, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  return !error;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function fetchSubscriptions(
  userId: string = DEMO_USER_ID
): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, name, amount, is_opted_out")
    .eq("user_id", userId)
    .order("name");
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    isOptedOut: row.is_opted_out,
  }));
}

export async function toggleSubscriptionOptOut(
  userId: string,
  subscriptionId: string
): Promise<boolean> {
  const { data: current } = await supabase
    .from("subscriptions")
    .select("is_opted_out")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .single();
  if (!current) return false;
  const { error } = await supabase
    .from("subscriptions")
    .update({
      is_opted_out: !current.is_opted_out,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId)
    .eq("user_id", userId);
  return !error;
}

// ---------------------------------------------------------------------------
// Analysis (analyses + analysis_categories + analysis_transactions)
// ---------------------------------------------------------------------------

export async function fetchAnalysis(
  userId: string = DEMO_USER_ID,
  includeMomo: boolean = true
): Promise<AnalysisData | null> {
  const { data: analysisRow, error: analysisError } = await supabase
    .from("analyses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (analysisError || !analysisRow) return null;

  const { data: categoryRows, error: catError } = await supabase
    .from("analysis_categories")
    .select("id, key, name, name_xhosa, amount, percentage, severity")
    .eq("analysis_id", analysisRow.id)
    .order("key");
  if (catError || !categoryRows?.length) {
    return {
      totalLoss: Number(analysisRow.total_loss),
      monthlyIncome: Number(analysisRow.monthly_income),
      categories: [],
      summary: {
        en: analysisRow.summary_en ?? "",
        xh: analysisRow.summary_xh ?? "",
      },
      ...(includeMomo &&
        analysisRow.momo_total_spent != null && {
          momoData: {
            totalSpent: Number(analysisRow.momo_total_spent),
            alternativeCost: Number(analysisRow.momo_alternative_cost),
            potentialSavings: Number(analysisRow.momo_potential_savings),
            breakdown:
              analysisRow.momo_breakdown && typeof analysisRow.momo_breakdown === "object"
                ? (analysisRow.momo_breakdown as AnalysisData["momoData"] extends undefined
                    ? never
                    : NonNullable<AnalysisData["momoData"]>["breakdown"])
                : {
                    airtime: { momoSpent: 0, alternativeCost: 0 },
                    data: { momoSpent: 0, alternativeCost: 0 },
                  },
          },
        }),
    };
  }

  const categoryIds = categoryRows.map((c) => c.id);
  const { data: txRows } = await supabase
    .from("analysis_transactions")
    .select("category_id, tx_id, tx_date, merchant, amount, category_name")
    .in("category_id", categoryIds)
    .order("tx_date", { ascending: false });

  const txByCategory = new Map<string, typeof txRows>();
  (txRows ?? []).forEach((tx) => {
    const list = txByCategory.get(tx.category_id) ?? [];
    list.push(tx);
    txByCategory.set(tx.category_id, list);
  });

  const idToKey = new Map(categoryRows.map((c) => [c.id, c.key]));

  const categories = categoryRows.map((cat) => {
    const txs = (txByCategory.get(cat.id) ?? []).map((t) => ({
      id: t.tx_id ?? "",
      date: t.tx_date,
      merchant: t.merchant,
      amount: Number(t.amount),
      category: t.category_name,
    }));
    return {
      id: cat.key,
      name: cat.name,
      nameXhosa: cat.name_xhosa ?? "",
      amount: Number(cat.amount),
      percentage: Number(cat.percentage),
      severity: cat.severity as "critical" | "warning" | "info",
      transactions: txs,
    };
  });

  // If includeMomo is false, filter out momo-fees category
  const filteredCategories = includeMomo
    ? categories
    : categories.filter((c) => c.id !== "momo-fees");

  const totalLoss = includeMomo
    ? Number(analysisRow.total_loss)
    : filteredCategories.reduce((sum, c) => sum + c.amount, 0);

  return {
    totalLoss,
    monthlyIncome: Number(analysisRow.monthly_income),
    categories: filteredCategories,
    summary: {
      en: analysisRow.summary_en ?? "",
      xh: analysisRow.summary_xh ?? "",
    },
    ...(includeMomo &&
      analysisRow.momo_total_spent != null && {
        momoData: {
          totalSpent: Number(analysisRow.momo_total_spent),
          alternativeCost: Number(analysisRow.momo_alternative_cost),
          potentialSavings: Number(analysisRow.momo_potential_savings),
          breakdown:
            analysisRow.momo_breakdown && typeof analysisRow.momo_breakdown === "object"
              ? (analysisRow.momo_breakdown as {
                  airtime: { momoSpent: number; alternativeCost: number };
                  data: { momoSpent: number; alternativeCost: number };
                })
              : {
                  airtime: { momoSpent: 0, alternativeCost: 0 },
                  data: { momoSpent: 0, alternativeCost: 0 },
                },
        },
      }),
  };
}

// ---------------------------------------------------------------------------
// User bank accounts (freeze “specific accounts”)
// ---------------------------------------------------------------------------

export interface UserBankAccount {
  id: string;
  bank: string;
  name: string;
  type: "current" | "savings" | "wallet";
  isFrozen: boolean;
}

export async function fetchUserBankAccounts(
  userId: string = DEMO_USER_ID
): Promise<UserBankAccount[]> {
  const { data, error } = await supabase
    .from("user_bank_accounts")
    .select("id, bank, name, type, is_frozen")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    bank: row.bank,
    name: row.name,
    type: row.type as "current" | "savings" | "wallet",
    isFrozen: row.is_frozen,
  }));
}

export async function updateUserBankAccountFrozen(
  userId: string,
  accountId: string,
  isFrozen: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from("user_bank_accounts")
    .update({ is_frozen: isFrozen })
    .eq("id", accountId)
    .eq("user_id", userId);
  return !error;
}

/** Remove (unlink) a user bank account. Returns true if deleted. */
export async function removeUserBankAccount(
  userId: string,
  accountId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("user_bank_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", userId);
  return !error;
}

// ---------------------------------------------------------------------------
// Debit orders (pause control)
// ---------------------------------------------------------------------------

export interface DebitOrderRow {
  id: string;
  posted_date: string;
  description: string;
  reference: string | null;
  amount: number;
  is_paused: boolean;
}

export async function fetchDebitOrders(
  userId: string = DEMO_USER_ID
): Promise<{ id: string; date: string; description: string; reference: string; amount: number; isPaused: boolean }[]> {
  const { data, error } = await supabase
    .from("debit_orders")
    .select("id, posted_date, description, reference, amount, is_paused")
    .eq("user_id", userId)
    .order("posted_date", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    date: row.posted_date,
    description: row.description,
    reference: row.reference ?? "",
    amount: Number(row.amount),
    isPaused: row.is_paused,
  }));
}

export async function updateDebitOrderPaused(
  userId: string,
  orderId: string,
  isPaused: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from("debit_orders")
    .update({ is_paused: isPaused, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("user_id", userId);
  return !error;
}

// ---------------------------------------------------------------------------
// Banks (home, bank autopsy)
// ---------------------------------------------------------------------------

export interface BankRow {
  id: string;
  name: string;
  type: "bank" | "momo";
  total_lost: number;
}

export async function fetchBanks(): Promise<
  { id: string; name: string; type: "bank" | "momo"; totalLost: number }[]
> {
  const { data, error } = await supabase
    .from("banks")
    .select("id, name, type, total_lost")
    .order("total_lost", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type as "bank" | "momo",
    totalLost: Number(row.total_lost),
  }));
}

/** Slug for bank id: lowercase, spaces to hyphens (e.g. "Standard Bank" -> "standard-bank"). */
function bankIdSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function addBank(params: {
  name: string;
  type: "bank" | "momo";
}): Promise<{ id: string } | null> {
  const id = bankIdSlug(params.name);
  if (!id) return null;
  const { error } = await supabase
    .from("banks")
    .upsert(
      {
        id,
        name: params.name.trim(),
        type: params.type,
        total_lost: 0,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (error) return null;
  return { id };
}

/** Remove a bank (and cascade: autopsy causes/leaks). Returns true if deleted. */
export async function removeBank(bankId: string): Promise<boolean> {
  const { error } = await supabase.from("banks").delete().eq("id", bankId);
  return !error;
}

// ---------------------------------------------------------------------------
// Discounts / rewards (retailer offers – from DB)
// ---------------------------------------------------------------------------

export interface DiscountRow {
  id: string;
  retailer: string;
  title: string;
  description: string;
  discount_value: string;
  code: string | null;
  tier: string;
  earned_from: string;
  expires_days: number;
  display_order: number;
}

export async function fetchDiscounts(): Promise<DiscountRow[]> {
  const { data, error } = await supabase
    .from("discounts")
    .select("id, retailer, title, description, discount_value, code, tier, earned_from, expires_days, display_order")
    .order("display_order", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    retailer: row.retailer,
    title: row.title,
    description: row.description,
    discount_value: row.discount_value,
    code: row.code ?? null,
    tier: row.tier,
    earned_from: row.earned_from,
    expires_days: Number(row.expires_days) || 30,
    display_order: Number(row.display_order) || 0,
  }));
}

/** User's unlocked discounts (for future: show only unlocked by usage). */
export async function fetchUserDiscounts(
  userId: string = DEMO_USER_ID
): Promise<{ discount_id: string; unlocked_at: string; expires_at: string | null }[]> {
  const { data, error } = await supabase
    .from("user_discounts")
    .select("discount_id, unlocked_at, expires_at")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((row) => ({
    discount_id: row.discount_id,
    unlocked_at: row.unlocked_at,
    expires_at: row.expires_at ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Bank autopsy causes & leaks
// ---------------------------------------------------------------------------

export interface AutopsyCauseRow {
  id: string;
  title: string;
  amount: number;
  percent_of_income: number;
}

export async function fetchBankAutopsyCauses(
  bankId: string
): Promise<{ id: string; title: string; amount: number; percentOfIncome: number }[]> {
  const { data, error } = await supabase
    .from("bank_autopsy_causes")
    .select("id, title, amount, percent_of_income")
    .eq("bank_id", bankId)
    .order("amount", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    percentOfIncome: Number(row.percent_of_income),
  }));
}

export interface LeakRow {
  id: string;
  leak_date: string;
  merchant: string;
  description: string;
  channel: string;
  tag: string;
  amount: number;
}

export async function fetchBankAutopsyLeaksByCause(
  causeId: string
): Promise<
  { id: string; date: string; merchant: string; description: string; channel: string; tag: string; amount: number }[]
> {
  const { data, error } = await supabase
    .from("bank_autopsy_leaks")
    .select("id, leak_date, merchant, description, channel, tag, amount")
    .eq("cause_id", causeId)
    .order("leak_date", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    date: row.leak_date,
    merchant: row.merchant,
    description: row.description,
    channel: row.channel,
    tag: row.tag,
    amount: Number(row.amount),
  }));
}

// ---------------------------------------------------------------------------
// Income accounts & reroute plan
// ---------------------------------------------------------------------------

export interface IncomeAccountRow {
  id: string;
  bank_name: string;
  nickname: string;
  type: "salary" | "savings" | "highFee";
  current_income_share: number;
  suggested_income_share: number;
}

export async function fetchIncomeAccounts(
  userId: string = DEMO_USER_ID
): Promise<
  { id: string; bank: string; nickname: string; type: "salary" | "savings" | "highFee"; currentIncome: number; suggestedIncome: number }[]
> {
  const { data, error } = await supabase
    .from("income_accounts")
    .select("id, bank_name, nickname, type, current_income_share, suggested_income_share")
    .eq("user_id", userId)
    .order("id");
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    bank: row.bank_name,
    nickname: row.nickname,
    type: row.type as "salary" | "savings" | "highFee",
    currentIncome: Number(row.current_income_share),
    suggestedIncome: Number(row.suggested_income_share),
  }));
}

const DEFAULT_REROUTE_PLAN_ID = "33333333-3333-3333-3333-333333333333";

export async function fetchReroutePlan(
  userId: string = DEMO_USER_ID
): Promise<{ planId: string; plan: Record<string, boolean>; isApplied: boolean }> {
  const { data: planRow, error: planError } = await supabase
    .from("reroute_plans")
    .select("id, is_applied")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (planError || !planRow) {
    return { planId: DEFAULT_REROUTE_PLAN_ID, plan: {}, isApplied: false };
  }
  const { data: accountRows, error: accError } = await supabase
    .from("reroute_plan_accounts")
    .select("account_id, enabled")
    .eq("plan_id", planRow.id);
  if (accError || !accountRows) {
    return { planId: planRow.id, plan: {}, isApplied: planRow.is_applied };
  }
  const plan: Record<string, boolean> = {};
  accountRows.forEach((r) => {
    plan[r.account_id] = r.enabled;
  });
  return { planId: planRow.id, plan, isApplied: planRow.is_applied };
}

export async function updateReroutePlan(
  userId: string,
  planId: string,
  plan: Record<string, boolean>,
  isApplied: boolean
): Promise<boolean> {
  const { error: planError } = await supabase
    .from("reroute_plans")
    .update({ is_applied: isApplied, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("user_id", userId);
  if (planError) return false;
  const accountIds = Object.keys(plan);
  for (const accountId of accountIds) {
    const { error: accError } = await supabase
      .from("reroute_plan_accounts")
      .upsert(
        { plan_id: planId, account_id: accountId, enabled: plan[accountId] },
        { onConflict: "plan_id,account_id" }
      );
    if (accError) return false;
  }
  return true;
}

export async function getOrCreateReroutePlanId(
  userId: string = DEMO_USER_ID
): Promise<string | null> {
  const { data } = await supabase
    .from("reroute_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data?.id ?? DEFAULT_REROUTE_PLAN_ID;
}

// ---------------------------------------------------------------------------
// Category accounts (category/[category] screen – account autopsy per category)
// ---------------------------------------------------------------------------

export type CategoryId =
  | "banks"
  | "telcos"
  | "loans"
  | "insurance"
  | "subscriptions";

export interface CategoryAccountRow {
  account_id: string;
  name: string;
  spent: number;
  fees: number;
  debits: number;
  other: number;
}

export async function fetchCategoryAccounts(
  userId: string,
  category: CategoryId
): Promise<{ id: string; name: string; spent: number; fees: number; debits: number; other: number }[]> {
  const { data, error } = await supabase
    .from("category_accounts")
    .select("account_id, name, spent, fees, debits, other")
    .eq("user_id", userId)
    .eq("category", category)
    .order("display_order");
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.account_id,
    name: row.name,
    spent: Number(row.spent),
    fees: Number(row.fees),
    debits: Number(row.debits),
    other: Number(row.other),
  }));
}

// ---------------------------------------------------------------------------
// Partner recommendations (rerouting – better savings based on user data)
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  banks: "Bank fees & accounts",
  telcos: "Airtime & data",
  loans: "Loans & mashonisa",
  insurance: "Insurance",
  subscriptions: "Subscriptions & recurring",
};

export interface PartnerRecommendationRow {
  id: string;
  partner_type: string;
  partner_name: string;
  title: string;
  description: string;
  savings_estimate: string;
  category: string;
  discount_id: string | null;
  cta_label: string;
  display_order: number;
}

export async function fetchPartnerRecommendations(
  category?: string
): Promise<PartnerRecommendationRow[]> {
  let query = supabase
    .from("partner_recommendations")
    .select("id, partner_type, partner_name, title, description, savings_estimate, category, discount_id, cta_label, display_order")
    .order("display_order", { ascending: true });
  if (category) {
    query = query.eq("category", category);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    partner_type: row.partner_type,
    partner_name: row.partner_name,
    title: row.title,
    description: row.description,
    savings_estimate: row.savings_estimate,
    category: row.category,
    discount_id: row.discount_id ?? null,
    cta_label: row.cta_label ?? "See offer",
    display_order: Number(row.display_order) || 0,
  }));
}

/** Spending by category for reroute – to show "You spend RXXX on [category]" and match partner recommendations. */
export interface SpendingByCategory {
  category: string;
  label: string;
  totalSpent: number;
}

export async function fetchSpendingSummaryForReroute(
  userId: string = DEMO_USER_ID
): Promise<SpendingByCategory[]> {
  const { data, error } = await supabase
    .from("category_accounts")
    .select("category, spent, fees, debits, other")
    .eq("user_id", userId);
  if (error || !data) return [];
  const byCategory = new Map<string, number>();
  data.forEach((row) => {
    const total = Number(row.spent) + Number(row.fees) + Number(row.debits) + Number(row.other);
    const current = byCategory.get(row.category) ?? 0;
    byCategory.set(row.category, current + total);
  });
  return Array.from(byCategory.entries())
    .map(([category, totalSpent]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      totalSpent,
    }))
    .filter((s) => s.totalSpent > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent);
}
