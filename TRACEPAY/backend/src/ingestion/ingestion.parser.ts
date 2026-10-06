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

export async function parseIngestionReadings(
  client: SupabaseClient,
  readings: readonly ReadingRow[],
  authenticatedUserId: string,
): Promise<void> {
  if (!authenticatedUserId.trim()) {
    throw new Error("Authenticated user is required.");
  }

  const parsed = readings
    .map((reading) => toParsedTransaction({ ...reading, user_id: authenticatedUserId }))
    .filter((row): row is ParsedTransactionRow => Boolean(row));
  if (parsed.length === 0) {
    return;
  }

  const { error } = await client.from("parsed_transactions").upsert(parsed, {
    onConflict: "user_id,source,client_id",
  });

  if (error) {
    throw new Error(
      `Could not store parsed transactions (${error.code ?? "unknown"}): ${error.message}`,
    );
  }
}
