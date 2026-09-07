import type { SupabaseClient } from "@supabase/supabase-js";

import type { IngestionSource } from "./ingestion.types.js";

const AMOUNT = /(?:r|zar)\s?([0-9]+(?:[.,][0-9]{2})?)/i;
const DEBIT_WORDS = /\b(debit|debited|purchase|payment|paid|pos|card transaction|spent)\b/i;
const CREDIT_WORDS = /\b(credit|credited|deposit|received|refund|reversal)\b/i;
const BANK_WORDS = /\b(bank|card|account|payment|purchase|debit|credit|pos|eft|absa|capitec|fnb|nedbank|standard bank|tymebank|discovery bank)\b/i;
const STOP_MERCHANTS = new Set(["payment", "purchase", "transaction", "account", "card", "bank"]);

type ReadingRow = {
  id: string;
  user_id: string;
  client_id: string;
  source: IngestionSource;
  received_at: string;
  sender: string | null;
  app_identifier: string | null;
  title: string | null;
  body: string;
};

type ParsedTransactionRow = {
  user_id: string;
  client_id: string;
  bank: string;
  type: "debit" | "credit" | "reversal" | "unknown";
  amount: number;
  currency: "ZAR";
  merchant: string | null;
  summary: string | null;
  category: "groceries" | "fuel" | "dining" | "entertainment" | "utilities" | "transfer" | "atm" | "online" | "medical" | "other";
  occurred_at: string;
  parsed_at: string;
  confidence: "high" | "medium" | "low";
  metadata: Record<string, unknown>;
  source: "sms_parse" | "notification_parse";
  transaction_id: string;
  merchant_key: string | null;
  normalisation_version: number;
  normalised_at: string;
};

type LeakCandidate = {
  user_id: string;
  merchant_key: string;
  merchant: string;
  monthly_amount: number;
  count: number;
};

function parseAmount(body: string): number | null {
  const match = body.match(AMOUNT);
  if (!match?.[1]) {
    return null;
  }
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseType(body: string): ParsedTransactionRow["type"] {
  if (CREDIT_WORDS.test(body)) {
    return body.toLowerCase().includes("reversal") ? "reversal" : "credit";
  }
  if (DEBIT_WORDS.test(body)) {
    return "debit";
  }
  return "unknown";
}

function normalizeMerchant(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const merchant = value
    .replace(/[^a-z0-9 &.'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (merchant.length < 2 || STOP_MERCHANTS.has(merchant.toLowerCase())) {
    return null;
  }
  return merchant.slice(0, 80);
}

function parseMerchant(body: string): string | null {
  const patterns = [
    /\bat\s+([a-z0-9 &.'-]{2,80})/i,
    /\bfrom\s+([a-z0-9 &.'-]{2,80})/i,
    /\bto\s+([a-z0-9 &.'-]{2,80})/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    const merchant = normalizeMerchant(match?.[1] ?? null);
    if (merchant) {
      return merchant;
    }
  }

  return null;
}

function merchantKey(merchant: string | null): string | null {
  return merchant?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || null;
}

function bankName(reading: ReadingRow): string {
  return (reading.sender || reading.app_identifier || "unknown").slice(0, 64);
}

function toParsedTransaction(reading: ReadingRow): ParsedTransactionRow | null {
  const text = `${reading.title ?? ""} ${reading.body}`.trim();
  if (!BANK_WORDS.test(`${reading.sender ?? ""} ${reading.app_identifier ?? ""} ${text}`)) {
    return null;
  }

  const amount = parseAmount(text);
  if (!amount) {
    return null;
  }

  const type = parseType(text);
  const merchant = parseMerchant(text);
  const key = merchantKey(merchant);
  const now = new Date().toISOString();

  return {
    user_id: reading.user_id,
    client_id: reading.client_id,
    bank: bankName(reading),
    type,
    amount,
    currency: "ZAR",
    merchant,
    summary: text.slice(0, 240),
    category: "other",
    occurred_at: reading.received_at,
    parsed_at: now,
    confidence: merchant && type !== "unknown" ? "high" : "medium",
    metadata: { ingestionReadingId: reading.id },
    source: reading.source === "sms" ? "sms_parse" : "notification_parse",
    transaction_id: `ingestion:${reading.id}`,
    merchant_key: key,
    normalisation_version: 1,
    normalised_at: now,
  };
}

async function refreshRecurringLeaks(client: SupabaseClient, userId: string): Promise<void> {
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("parsed_transactions")
    .select("merchant, merchant_key, amount")
    .eq("user_id", userId)
    .eq("type", "debit")
    .not("merchant_key", "is", null)
    .gte("occurred_at", since);

  if (error || !data) {
    return;
  }

  const grouped = new Map<string, LeakCandidate>();
  for (const row of data as Array<{ merchant: string | null; merchant_key: string | null; amount: number | string }>) {
    if (!row.merchant || !row.merchant_key) {
      continue;
    }
    const amount = Number(row.amount);
    const current = grouped.get(row.merchant_key) ?? {
      user_id: userId,
      merchant_key: row.merchant_key,
      merchant: row.merchant,
      monthly_amount: 0,
      count: 0,
    };
    current.monthly_amount += Number.isFinite(amount) ? amount : 0;
    current.count += 1;
    grouped.set(row.merchant_key, current);
  }

  const leaks = [...grouped.values()]
    .filter((candidate) => candidate.count >= 2 && candidate.monthly_amount > 0)
    .map((candidate) => ({
      user_id: userId,
      fi_code: "FI-001",
      subject_key: candidate.merchant_key,
      status: "active",
      detection_rule: "recurring_ingestion_debit_v1",
      resolution_rule: "merchant_stops_recurring_v1",
      evidence: {
        source: "device_ingestion",
        transactionCount: candidate.count,
      },
      merchant: candidate.merchant,
      amount_monthly: Number(candidate.monthly_amount.toFixed(2)),
      amount_annual: Number((candidate.monthly_amount * 12).toFixed(2)),
      exact_action: `Review recurring payments to ${candidate.merchant} and cancel or downgrade anything you no longer need.`,
    }));

  if (leaks.length > 0) {
    await client.from("leaks").upsert(leaks, {
      onConflict: "user_id,subject_key,detection_rule",
    });
  }
}

export async function parseIngestionReadings(
  client: SupabaseClient,
  readings: readonly ReadingRow[],
): Promise<void> {
  const parsed = readings.map(toParsedTransaction).filter((row): row is ParsedTransactionRow => Boolean(row));
  if (parsed.length === 0) {
    return;
  }

  const { error } = await client.from("parsed_transactions").upsert(parsed, {
    onConflict: "user_id,source,client_id",
  });

  if (error) {
    return;
  }

  const userIds = [...new Set(parsed.map((row) => row.user_id))];
  await Promise.all(userIds.map((userId) => refreshRecurringLeaks(client, userId)));
}
