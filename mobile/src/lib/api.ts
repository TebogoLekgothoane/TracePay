import { supabase, DEMO_USER_ID } from "./supabase";
import type { AnalysisData, Subscription, Language } from "@/types/navigation";

/** Max wait for Supabase before using demo data – keeps loading fast when offline/slow */
const SUPABASE_FETCH_TIMEOUT_MS = 600;

function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Register user in Supabase (after backend sign-up)
// ---------------------------------------------------------------------------

/** Short prefix from userId for per-user unique ids (subscriptions table has id as sole PK). */
function userPrefix(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8);
}

/**
 * Seeds default app data for a new user (subscriptions, freeze_settings,
 * user_bank_accounts, debit_orders) so they see banks, rewards, subscriptions like the demo.
 */
async function seedDefaultDataForUser(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const p = userPrefix(userId);
  await supabase.from("subscriptions").upsert(
    [
      { id: `netflix-${p}`, user_id: userId, name: "Netflix SA", amount: 159, is_opted_out: false, updated_at: now },
      { id: `showmax-${p}`, user_id: userId, name: "Showmax", amount: 99, is_opted_out: false, updated_at: now },
      { id: `spotify-${p}`, user_id: userId, name: "Spotify", amount: 59.99, is_opted_out: false, updated_at: now },
      { id: `dstv-${p}`, user_id: userId, name: "DSTV Now", amount: 29, is_opted_out: false, updated_at: now },
      { id: `youtube-${p}`, user_id: userId, name: "YouTube Premium", amount: 71.99, is_opted_out: false, updated_at: now },
    ],
    { onConflict: "id" }
  );
  await supabase.from("freeze_settings").upsert(
    { user_id: userId, pause_debit_orders: false, block_fee_accounts: false, set_airtime_limit: false, cancel_subscriptions: false, updated_at: now },
    { onConflict: "user_id" }
  );
  await supabase.from("user_bank_accounts").upsert(
    [
      { id: "capitec-main", user_id: userId, bank: "Capitec", name: "Everyday Account", type: "current", is_frozen: false },
      { id: "capitec-save", user_id: userId, bank: "Capitec", name: "Savings Pocket", type: "savings", is_frozen: false },
      { id: "standard-main", user_id: userId, bank: "Standard Bank", name: "Cheque Account", type: "current", is_frozen: false },
      { id: "absa-fee", user_id: userId, bank: "Absa", name: "High-fee Account", type: "current", is_frozen: false },
      { id: "mtn-momo", user_id: userId, bank: "MTN MoMo", name: "MoMo Wallet", type: "wallet", is_frozen: false },
    ],
    { onConflict: "id,user_id" }
  );
  const d = userPrefix(userId);
  await supabase.from("debit_orders").upsert(
    [
      { id: `1-${d}`, user_id: userId, posted_date: "2026-01-03", description: "MTN SP DEBIT ORDER", reference: "MTNSP/1234567890", amount: 499, is_paused: false, updated_at: now },
      { id: `2-${d}`, user_id: userId, posted_date: "2026-01-05", description: "INSURANCE PREMIUM DEBIT", reference: "INSURECO/987654321", amount: 320.5, is_paused: false, updated_at: now },
      { id: `3-${d}`, user_id: userId, posted_date: "2026-01-09", description: "GYM MEMBERSHIP", reference: "FITGYM/135792468", amount: 299, is_paused: false, updated_at: now },
      { id: `4-${d}`, user_id: userId, posted_date: "2026-01-12", description: "STREAMING SERVICE", reference: "STREAMCO/246813579", amount: 189.99, is_paused: false, updated_at: now },
    ],
    { onConflict: "id" }
  );
}

/**
 * Inserts the user into Supabase `users` and `user_settings`, and seeds default
 * data (subscriptions, freeze_settings, user_bank_accounts, debit_orders) so
 * the app shows banks, rewards, subscriptions like before. Call after backend
 * register with the returned user_id and email.
 */
export async function registerUserInSupabase(
  userId: string,
  email: string
): Promise<boolean> {
  const username = email.replace(/@.*$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "user";
  const { error: userError } = await supabase.from("users").upsert(
    {
      id: userId,
      username: username,
      full_name: email,
    },
    { onConflict: "id", ignoreDuplicates: false }
  );
  if (userError) {
    console.warn("Supabase users insert error:", userError);
    return false;
  }
  const { error: settingsError } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      language: "en",
      include_momo_data: true,
      airtime_limit: 300,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (settingsError) {
    console.warn("Supabase user_settings insert error:", settingsError);
    return false;
  }
  try {
    await seedDefaultDataForUser(userId);
  } catch (e) {
    console.warn("Supabase seed default data error:", e);
  }
  return true;
}

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

/** Fallback demo user settings for 00000000-0000-0000-0000-000000000001 when Supabase is unreachable */
const DEMO_USER_SETTINGS: UserSettingsRow = {
  user_id: DEMO_USER_ID,
  language: "en",
  include_momo_data: true,
  airtime_limit: 300,
};

export async function fetchUserSettings(
  userId: string = DEMO_USER_ID
): Promise<UserSettingsRow | null> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", userId)
          .single();
        if (error || !data) return DEMO_USER_SETTINGS;
        return data as UserSettingsRow;
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_USER_SETTINGS;
  }
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

/** Fallback demo freeze settings when Supabase is empty or unreachable */
const DEMO_FREEZE_SETTINGS: FreezeSettingsRow = {
  pause_debit_orders: false,
  block_fee_accounts: false,
  set_airtime_limit: false,
  cancel_subscriptions: false,
};

export async function fetchFreezeSettings(
  userId: string = DEMO_USER_ID
): Promise<FreezeSettingsRow | null> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("freeze_settings")
          .select("*")
          .eq("user_id", userId)
          .single();
        if (error || !data) return DEMO_FREEZE_SETTINGS;
        return data as FreezeSettingsRow;
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_FREEZE_SETTINGS;
  }
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

/** Fallback demo subscriptions when Supabase is empty or unreachable */
const DEMO_SUBSCRIPTIONS: Subscription[] = [
  { id: "netflix", name: "Netflix SA", amount: 159, isOptedOut: false },
  { id: "showmax", name: "Showmax", amount: 99, isOptedOut: false },
  { id: "spotify", name: "Spotify", amount: 59.99, isOptedOut: false },
  { id: "dstv", name: "DSTV Now", amount: 29, isOptedOut: false },
  { id: "youtube", name: "YouTube Premium", amount: 71.99, isOptedOut: false },
];

export async function fetchSubscriptions(
  userId: string = DEMO_USER_ID
): Promise<Subscription[]> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("id, name, amount, is_opted_out")
          .eq("user_id", userId)
          .order("name");
        if (error || !data?.length) return DEMO_SUBSCRIPTIONS;
        return data.map((row) => ({
          id: row.id,
          name: row.name,
          amount: Number(row.amount),
          isOptedOut: row.is_opted_out,
        }));
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_SUBSCRIPTIONS;
  }
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

/** Canonical demo total loss – must match sum of DEMO_BANKS.totalLost (1193.5 + 530.2 + 496 = 2219.7) */
const DEMO_TOTAL_LOSS = 2219.7;

/** Fallback demo analysis for user 00000000-0000-0000-0000-000000000001 when Supabase is empty or unreachable */
const DEMO_ANALYSIS_DATA: AnalysisData = {
  totalLoss: DEMO_TOTAL_LOSS,
  monthlyIncome: 8500,
  summary: {
    en: "This month you lost R2,220. Airtime and MoMo fees, bank fees, subscriptions and debit orders are the main leaks. Switch to monthly data bundles to save on telco spend; use TracePay to pause or reroute the rest.",
    xh: "Kule nyanga ulahlekelwe yi-R2,220. I-airtime neemali ze-MoMo, iimali zebhanki, izabhaliso nee-debit order yimithombo eyintloko. Tshintsha kwi-data bundles zenyanga ukuze ugcine kwi-telco; sebenzisa i-TracePay ukumisa okanye ukuyihlela enye.",
  },
  momoData: {
    totalSpent: 496,
    alternativeCost: 350,
    potentialSavings: 146,
    breakdown: { airtime: { momoSpent: 280, alternativeCost: 200 }, data: { momoSpent: 216, alternativeCost: 150 } },
  },
  categories: [
    { id: "hidden-fees", name: "Hidden Fees", nameXhosa: "Iimali Ezifihlakeleyo", amount: 387, percentage: 4.5, severity: "critical", transactions: [{ id: "hf-1", date: "2026-01-12", merchant: "FNB Service Fee", amount: 15, category: "Hidden Fees" }, { id: "hf-2", date: "2026-01-07", merchant: "Capitec Monthly Fee", amount: 5, category: "Hidden Fees" }] },
    { id: "mashonisa", name: "Mashonisa Interest", nameXhosa: "Inzala yeMashonisa", amount: 603, percentage: 7.1, severity: "critical", transactions: [{ id: "ms-1", date: "2025-12-30", merchant: "Cash Loan Interest", amount: 42, category: "Mashonisa Interest" }] },
    { id: "airtime", name: "Airtime Drains", nameXhosa: "Ukuphela kwe-Airtime", amount: 278, percentage: 3.3, severity: "warning", transactions: [{ id: "at-1", date: "2026-01-26", merchant: "Vodacom Airtime", amount: 18, category: "Airtime Drains" }] },
    { id: "subscriptions", name: "Subscriptions", nameXhosa: "Izabhaliso", amount: 240, percentage: 2.8, severity: "warning", transactions: [{ id: "sub-1", date: "2026-01-15", merchant: "Netflix SA", amount: 55, category: "Subscriptions" }] },
    { id: "bank-charges", name: "Bank Charges", nameXhosa: "Iintlawulo zeBhanki", amount: 163, percentage: 1.9, severity: "info", transactions: [{ id: "bc-1", date: "2026-01-10", merchant: "ATM Withdrawal Fee", amount: 8, category: "Bank Charges" }] },
    { id: "other", name: "Other Losses", nameXhosa: "Ezinye Ilahleko", amount: 77, percentage: 0.9, severity: "info", transactions: [] },
    { id: "momo-fees", name: "MoMo Fees", nameXhosa: "Iimali ze-MoMo", amount: 471.7, percentage: 5.5, severity: "warning", transactions: [{ id: "momo-1", date: "2026-01-20", merchant: "MoMo Airtime Purchase", amount: 10, category: "MoMo Fees" }] },
  ],
};

export async function fetchAnalysis(
  userId: string = DEMO_USER_ID,
  includeMomo: boolean = true
): Promise<AnalysisData | null> {
  const getDemoAnalysis = () => {
    if (!includeMomo) {
      const categories = DEMO_ANALYSIS_DATA.categories.filter((c) => c.id !== "momo-fees");
      const totalLoss = categories.reduce((sum, c) => sum + c.amount, 0);
      return { ...DEMO_ANALYSIS_DATA, categories, totalLoss, momoData: undefined };
    }
    return DEMO_ANALYSIS_DATA;
  };
  try {
    return await raceWithTimeout(
      (async (): Promise<AnalysisData> => {
        const { data: analysisRow, error: analysisError } = await supabase
          .from("analyses")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (analysisError || !analysisRow) return getDemoAnalysis() as AnalysisData;

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
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return getDemoAnalysis();
  }
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

/** Fallback demo user bank accounts when Supabase is empty or unreachable */
const DEMO_USER_BANK_ACCOUNTS: UserBankAccount[] = [
  { id: "capitec-main", bank: "Capitec", name: "Everyday Account", type: "current", isFrozen: false },
  { id: "capitec-save", bank: "Capitec", name: "Savings Pocket", type: "savings", isFrozen: false },
  { id: "standard-main", bank: "Standard Bank", name: "Cheque Account", type: "current", isFrozen: false },
  { id: "absa-fee", bank: "Absa", name: "High-fee Account", type: "current", isFrozen: false },
  { id: "mtn-momo", bank: "MTN MoMo", name: "MoMo Wallet", type: "wallet", isFrozen: false },
];

export async function fetchUserBankAccounts(
  userId: string = DEMO_USER_ID
): Promise<UserBankAccount[]> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("user_bank_accounts")
          .select("id, bank, name, type, is_frozen")
          .eq("user_id", userId);
        if (error || !data?.length) return DEMO_USER_BANK_ACCOUNTS;
        return data.map((row) => ({
          id: row.id,
          bank: row.bank,
          name: row.name,
          type: row.type as "current" | "savings" | "wallet",
          isFrozen: row.is_frozen,
        }));
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_USER_BANK_ACCOUNTS;
  }
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

/** Fallback demo debit orders when Supabase is empty or unreachable */
const DEMO_DEBIT_ORDERS: { id: string; date: string; description: string; reference: string; amount: number; isPaused: boolean }[] = [
  { id: "1", date: "2026-01-03", description: "MTN SP DEBIT ORDER", reference: "MTNSP/1234567890", amount: 499, isPaused: false },
  { id: "2", date: "2026-01-05", description: "INSURANCE PREMIUM DEBIT", reference: "INSURECO/987654321", amount: 320.5, isPaused: false },
  { id: "3", date: "2026-01-09", description: "GYM MEMBERSHIP", reference: "FITGYM/135792468", amount: 299, isPaused: false },
  { id: "4", date: "2026-01-12", description: "STREAMING SERVICE", reference: "STREAMCO/246813579", amount: 189.99, isPaused: false },
];

export async function fetchDebitOrders(
  userId: string = DEMO_USER_ID
): Promise<{ id: string; date: string; description: string; reference: string; amount: number; isPaused: boolean }[]> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("debit_orders")
          .select("id, posted_date, description, reference, amount, is_paused")
          .eq("user_id", userId)
          .order("posted_date", { ascending: false });
        if (error || !data?.length) return DEMO_DEBIT_ORDERS;
        return data.map((row) => ({
          id: row.id,
          date: row.posted_date,
          description: row.description,
          reference: row.reference ?? "",
          amount: Number(row.amount),
          isPaused: row.is_paused,
        }));
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_DEBIT_ORDERS;
  }
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

/** Fallback demo data when Supabase is empty or unreachable */
const DEMO_BANKS: { id: string; name: string; type: "bank" | "momo"; totalLost: number }[] = [
  { id: "capitec", name: "Capitec", type: "bank", totalLost: 1193.5 },
  { id: "standard-bank", name: "Standard Bank", type: "bank", totalLost: 530.2 },
  { id: "mtn-momo", name: "MTN MoMo", type: "momo", totalLost: 496 },
];

export async function fetchBanks(): Promise<
  { id: string; name: string; type: "bank" | "momo"; totalLost: number }[]
> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("banks")
          .select("id, name, type, total_lost")
          .order("total_lost", { ascending: false });
        if (error || !data?.length) return DEMO_BANKS;
        return data.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type as "bank" | "momo",
          totalLost: Number(row.total_lost),
        }));
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_BANKS;
  }
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

/** Fallback demo rewards when Supabase is empty or unreachable */
const DEMO_DISCOUNTS: DiscountRow[] = [
  { id: "checkers-10", retailer: "Checkers", title: "10% off your next shop", description: "Save on groceries when you spend R200 or more.", discount_value: "10% off", code: "TRACEPAY10", tier: "bronze", earned_from: "Unlocked after your first analysis", expires_days: 30, display_order: 1 },
  { id: "takealot-50", retailer: "Takealot", title: "R50 off electronics & home", description: "Minimum spend R500. Excludes certain categories.", discount_value: "R50 off", code: "TRACEPAY50", tier: "bronze", earned_from: "Unlocked after linking 1 bank", expires_days: 30, display_order: 2 },
  { id: "pick-n-pay-15", retailer: "Pick n Pay", title: "15% off Smart Shopper deal", description: "Use at till or online. One use per account.", discount_value: "15% off", code: "TRACEPAY15", tier: "silver", earned_from: "Unlocked after 2 analyses", expires_days: 30, display_order: 3 },
  { id: "woolworths-20", retailer: "Woolworths", title: "R20 off fresh food", description: "Fresh fruit, veg & bakery. Min spend R150.", discount_value: "R20 off", code: "TRACEPAY20", tier: "silver", earned_from: "Unlocked after freezing a leak", expires_days: 30, display_order: 4 },
  { id: "mtn-airtime", retailer: "MTN", title: "R5 off airtime or data", description: "Any recharge or bundle. In-store or app.", discount_value: "R5 off", code: null, tier: "silver", earned_from: "Unlocked after 3 analyses", expires_days: 30, display_order: 5 },
];

export async function fetchDiscounts(): Promise<DiscountRow[]> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("discounts")
          .select("id, retailer, title, description, discount_value, code, tier, earned_from, expires_days, display_order")
          .order("display_order", { ascending: true });
        if (error || !data?.length) return DEMO_DISCOUNTS;
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
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_DISCOUNTS;
  }
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

/** Fallback demo bank autopsy causes – amounts must sum to each bank's totalLost (capitec 1193.5, standard-bank 530.2, mtn-momo 496). */
const DEMO_BANK_AUTOPSY_CAUSES: Record<string, { id: string; title: string; amount: number; percentOfIncome: number }[]> = {
  capitec: [
    { id: "mashonisa", title: "Mashonisa Interest", amount: 697, percentOfIncome: 8.2 },
    { id: "hidden-fees", title: "Hidden Fees", amount: 286, percentOfIncome: 3.4 },
    { id: "airtime", title: "Airtime Drains", amount: 210.5, percentOfIncome: 2.5 },
  ],
  "standard-bank": [
    { id: "sb-fees", title: "Bank & Card Fees", amount: 180, percentOfIncome: 2.1 },
    { id: "sb-subscriptions", title: "Subscriptions", amount: 220, percentOfIncome: 2.6 },
    { id: "sb-debit", title: "Debit Orders", amount: 130.2, percentOfIncome: 1.5 },
  ],
  "mtn-momo": [
    { id: "momo-fees", title: "MoMo & Airtime", amount: 496, percentOfIncome: 5.8 },
  ],
};

export async function fetchBankAutopsyCauses(
  bankId: string
): Promise<{ id: string; title: string; amount: number; percentOfIncome: number }[]> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("bank_autopsy_causes")
          .select("id, title, amount, percent_of_income")
          .eq("bank_id", bankId)
          .order("amount", { ascending: false });
        if (error || !data?.length) return DEMO_BANK_AUTOPSY_CAUSES[bankId] ?? [];
        return data.map((row) => ({
          id: row.id,
          title: row.title,
          amount: Number(row.amount),
          percentOfIncome: Number(row.percent_of_income),
        }));
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_BANK_AUTOPSY_CAUSES[bankId] ?? [];
  }
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

/** Fallback demo bank autopsy leaks by cause (capitec + standard-bank) when Supabase is unreachable */
const DEMO_BANK_AUTOPSY_LEAKS: Record<string, { id: string; date: string; merchant: string; description: string; channel: string; tag: string; amount: number }[]> = {
  "hidden-fees": [
    { id: "hf-1", date: "2026-01-12", merchant: "Bank A", description: "Withdrawal Fee", channel: "bank_fee", tag: "hidden_fee", amount: 2.5 },
    { id: "hf-2", date: "2026-01-07", merchant: "Bank A", description: "SMS Notification Fee", channel: "bank_fee", tag: "hidden_fee", amount: 1.2 },
    { id: "hf-3", date: "2026-01-02", merchant: "Bank A", description: "Monthly Service Fee", channel: "bank_fee", tag: "hidden_fee", amount: 5.5 },
  ],
  mashonisa: [
    { id: "ms-1", date: "2025-12-30", merchant: "Informal", description: "Mr Dlamini Repayment", channel: "loan", tag: "loan_shark", amount: 1500 },
  ],
  airtime: [
    { id: "at-1", date: "2026-01-26", merchant: "Telco B", description: "Airtime Bundle", channel: "airtime", tag: "airtime_drain", amount: 29 },
    { id: "at-2", date: "2026-01-25", merchant: "Telco B", description: "Data Bundle", channel: "airtime", tag: "airtime_drain", amount: 5 },
    { id: "at-3", date: "2026-01-24", merchant: "Telco B", description: "WASP Subscription - Games", channel: "airtime", tag: "airtime_drain", amount: 12 },
    { id: "at-4", date: "2026-01-17", merchant: "Telco B", description: "Airtime Advance Repayment", channel: "airtime", tag: "airtime_drain", amount: 50 },
  ],
  "sb-fees": [
    { id: "sbf-1", date: "2026-01-15", merchant: "Standard Bank", description: "Monthly Account Fee", channel: "bank_fee", tag: "hidden_fee", amount: 55 },
    { id: "sbf-2", date: "2026-01-10", merchant: "Standard Bank", description: "Card Replacement Fee", channel: "bank_fee", tag: "hidden_fee", amount: 75 },
    { id: "sbf-3", date: "2026-01-08", merchant: "Standard Bank", description: "eStatement Fee", channel: "bank_fee", tag: "hidden_fee", amount: 12 },
    { id: "sbf-4", date: "2026-01-03", merchant: "Standard Bank", description: "ATM Withdrawal Fee", channel: "bank_fee", tag: "hidden_fee", amount: 38 },
  ],
  "sb-subscriptions": [
    { id: "sbs-1", date: "2026-01-18", merchant: "Netflix", description: "Monthly Subscription", channel: "subscription", tag: "subscription_trap", amount: 99 },
    { id: "sbs-2", date: "2026-01-14", merchant: "Showmax", description: "Streaming", channel: "subscription", tag: "subscription_trap", amount: 61 },
    { id: "sbs-3", date: "2026-01-05", merchant: "Spotify", description: "Premium", channel: "subscription", tag: "subscription_trap", amount: 60 },
  ],
  "sb-debit": [
    { id: "sbd-1", date: "2026-01-20", merchant: "Hollard", description: "Short-term Insurance", channel: "debit_order", tag: "debit_order", amount: 45.5 },
    { id: "sbd-2", date: "2026-01-15", merchant: "Virgin Active", description: "Gym Membership", channel: "debit_order", tag: "debit_order", amount: 49 },
    { id: "sbd-3", date: "2026-01-02", merchant: "Discovery", description: "Vitality Debit", channel: "debit_order", tag: "debit_order", amount: 35.7 },
  ],
  "momo-fees": [
    { id: "momo-1", date: "2026-01-22", merchant: "MTN", description: "Airtime Top-up", channel: "airtime", tag: "airtime_drain", amount: 150 },
    { id: "momo-2", date: "2026-01-18", merchant: "MTN", description: "Data Bundle", channel: "airtime", tag: "airtime_drain", amount: 199 },
    { id: "momo-3", date: "2026-01-12", merchant: "MTN", description: "MoMo Transfer", channel: "momo", tag: "momo_fee", amount: 87 },
    { id: "momo-4", date: "2026-01-08", merchant: "MTN", description: "Airtime Advance", channel: "airtime", tag: "airtime_drain", amount: 60 },
  ],
};

export async function fetchBankAutopsyLeaksByCause(
  causeId: string
): Promise<
  { id: string; date: string; merchant: string; description: string; channel: string; tag: string; amount: number }[]
> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("bank_autopsy_leaks")
          .select("id, leak_date, merchant, description, channel, tag, amount")
          .eq("cause_id", causeId)
          .order("leak_date", { ascending: false });
        if (error || !data?.length) return DEMO_BANK_AUTOPSY_LEAKS[causeId] ?? [];
        return data.map((row) => ({
          id: row.id,
          date: row.leak_date,
          merchant: row.merchant,
          description: row.description,
          channel: row.channel,
          tag: row.tag,
          amount: Number(row.amount),
        }));
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_BANK_AUTOPSY_LEAKS[causeId] ?? [];
  }
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

/** Fallback demo income accounts when Supabase is empty or unreachable */
const DEMO_INCOME_ACCOUNTS: { id: string; bank: string; nickname: string; type: "salary" | "savings" | "highFee"; currentIncome: number; suggestedIncome: number }[] = [
  { id: "1", bank: "Absa", nickname: "High‑fee current account", type: "highFee", currentIncome: 100, suggestedIncome: 10 },
  { id: "2", bank: "Capitec", nickname: "Everyday account", type: "salary", currentIncome: 0, suggestedIncome: 40 },
  { id: "3", bank: "Nedbank", nickname: "Low‑fee savings pocket", type: "savings", currentIncome: 0, suggestedIncome: 50 },
];

export async function fetchIncomeAccounts(
  userId: string = DEMO_USER_ID
): Promise<
  { id: string; bank: string; nickname: string; type: "salary" | "savings" | "highFee"; currentIncome: number; suggestedIncome: number }[]
> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("income_accounts")
          .select("id, bank_name, nickname, type, current_income_share, suggested_income_share")
          .eq("user_id", userId)
          .order("id");
        if (error || !data?.length) return DEMO_INCOME_ACCOUNTS;
        return data.map((row) => ({
          id: row.id,
          bank: row.bank_name,
          nickname: row.nickname,
          type: row.type as "salary" | "savings" | "highFee",
          currentIncome: Number(row.current_income_share),
          suggestedIncome: Number(row.suggested_income_share),
        }));
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_INCOME_ACCOUNTS;
  }
}

const DEFAULT_REROUTE_PLAN_ID = "33333333-3333-3333-3333-333333333333";

/** Fallback demo reroute plan when Supabase is empty or unreachable */
const DEMO_REROUTE_PLAN: { planId: string; plan: Record<string, boolean>; isApplied: boolean } = {
  planId: DEFAULT_REROUTE_PLAN_ID,
  plan: { "1": false, "2": false, "3": false },
  isApplied: false,
};

export async function fetchReroutePlan(
  userId: string = DEMO_USER_ID
): Promise<{ planId: string; plan: Record<string, boolean>; isApplied: boolean }> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data: planRow, error: planError } = await supabase
          .from("reroute_plans")
          .select("id, is_applied")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (planError || !planRow) return DEMO_REROUTE_PLAN;
        const { data: accountRows, error: accError } = await supabase
          .from("reroute_plan_accounts")
          .select("account_id, enabled")
          .eq("plan_id", planRow.id);
        if (accError) return DEMO_REROUTE_PLAN;
        if (!accountRows?.length) return { planId: planRow.id, plan: DEMO_REROUTE_PLAN.plan, isApplied: planRow.is_applied };
        const plan: Record<string, boolean> = {};
        accountRows.forEach((r) => {
          plan[r.account_id] = r.enabled;
        });
        return { planId: planRow.id, plan, isApplied: planRow.is_applied };
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_REROUTE_PLAN;
  }
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

/** Fallback demo category accounts for user 00000000-0000-0000-0000-000000000001 when Supabase is unreachable */
const DEMO_CATEGORY_ACCOUNTS: Record<CategoryId, { id: string; name: string; spent: number; fees: number; debits: number; other: number }[]> = {
  banks: [
    { id: "absa", name: "Absa Account", spent: 8250, fees: 225, debits: 3000, other: 5025 },
    { id: "standard", name: "Standard Bank", spent: 3650, fees: 180, debits: 2100, other: 1370 },
    { id: "capitec", name: "Capitec", spent: 1450, fees: 95, debits: 830, other: 525 },
  ],
  telcos: [
    { id: "vodacom", name: "Vodacom Wallet", spent: 1590, fees: 130, debits: 875, other: 585 },
    { id: "mtn-momo", name: "MTN MoMo", spent: 496, fees: 90, debits: 280, other: 126 },
  ],
  loans: [
    { id: "mashonisa", name: "Mashonisa Loan", spent: 1600, fees: 0, debits: 1600, other: 0 },
  ],
  insurance: [
    { id: "funeral", name: "Funeral Cover", spent: 320, fees: 0, debits: 320, other: 0 },
    { id: "device", name: "Device Insurance", spent: 200, fees: 0, debits: 200, other: 0 },
  ],
  subscriptions: [
    { id: "streaming", name: "Streaming Services", spent: 210, fees: 0, debits: 210, other: 0 },
    { id: "gym", name: "Gym Membership", spent: 100, fees: 0, debits: 100, other: 0 },
  ],
};

export async function fetchCategoryAccounts(
  userId: string,
  category: CategoryId
): Promise<{ id: string; name: string; spent: number; fees: number; debits: number; other: number }[]> {
  try {
    return await raceWithTimeout(
      (async () => {
        const { data, error } = await supabase
          .from("category_accounts")
          .select("account_id, name, spent, fees, debits, other")
          .eq("user_id", userId)
          .eq("category", category)
          .order("display_order");
        if (error || !data?.length) return DEMO_CATEGORY_ACCOUNTS[category] ?? [];
        return data.map((row) => ({
          id: row.account_id,
          name: row.name,
          spent: Number(row.spent),
          fees: Number(row.fees),
          debits: Number(row.debits),
          other: Number(row.other),
        }));
      })(),
      SUPABASE_FETCH_TIMEOUT_MS
    );
  } catch {
    return DEMO_CATEGORY_ACCOUNTS[category] ?? [];
  }
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

/** Demo partner recommendations – shown when user has linked accounts but Supabase has no rows (e.g. new/demo user). */
const DEMO_PARTNER_RECOMMENDATIONS: PartnerRecommendationRow[] = [
  {
    id: "demo-rec-subscriptions",
    partner_type: "retailer",
    partner_name: "Bundle streaming",
    title: "One bundle for Netflix, Showmax & Spotify",
    description: "Pay one price for multiple services and save vs separate subscriptions.",
    savings_estimate: "Save up to R120/month",
    category: "subscriptions",
    discount_id: null,
    cta_label: "See offer",
    display_order: 1,
  },
  {
    id: "demo-rec-telcos",
    partner_type: "telco",
    partner_name: "Prepaid data bundles",
    title: "Monthly data instead of ad‑hoc airtime",
    description: "Switch to a monthly data bundle so you stop overpaying for small top‑ups.",
    savings_estimate: "Save up to R80/month",
    category: "telcos",
    discount_id: null,
    cta_label: "Compare plans",
    display_order: 2,
  },
  {
    id: "demo-rec-banks",
    partner_type: "bank",
    partner_name: "Low‑fee accounts",
    title: "Move to an account with lower fees",
    description: "We can help you route salary and debits to accounts that charge less.",
    savings_estimate: "Save on fees",
    category: "banks",
    discount_id: null,
    cta_label: "Route income",
    display_order: 3,
  },
];

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
  if (error || !data || data.length === 0) {
    const demo = category
      ? DEMO_PARTNER_RECOMMENDATIONS.filter((r) => r.category === category)
      : DEMO_PARTNER_RECOMMENDATIONS;
    return demo;
  }
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

/** Demo spending by category – aligned to DEMO_TOTAL_LOSS (subscriptions + telcos + banks = 999 + 720 + 501 = 2220). */
const DEMO_SPENDING_BY_CATEGORY: SpendingByCategory[] = [
  { category: "subscriptions", label: CATEGORY_LABELS.subscriptions, totalSpent: 999 },
  { category: "telcos", label: CATEGORY_LABELS.telcos, totalSpent: 720 },
  { category: "banks", label: CATEGORY_LABELS.banks, totalSpent: 501 },
];

export async function fetchSpendingSummaryForReroute(
  userId: string = DEMO_USER_ID
): Promise<SpendingByCategory[]> {
  const { data, error } = await supabase
    .from("category_accounts")
    .select("category, spent, fees, debits, other")
    .eq("user_id", userId);
  if (error || !data) return DEMO_SPENDING_BY_CATEGORY;
  const byCategory = new Map<string, number>();
  data.forEach((row) => {
    const total = Number(row.spent) + Number(row.fees) + Number(row.debits) + Number(row.other);
    const current = byCategory.get(row.category) ?? 0;
    byCategory.set(row.category, current + total);
  });
  const result = Array.from(byCategory.entries())
    .map(([category, totalSpent]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      totalSpent,
    }))
    .filter((s) => s.totalSpent > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent);
  return result.length > 0 ? result : DEMO_SPENDING_BY_CATEGORY;
}
