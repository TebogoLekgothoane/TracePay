/**
 * Client-side merchant / counterparty extraction from SA bank descriptions.
 * Complements backend merchant_name (rules + AI) for list logos.
 */

const STRIP_PREFIXES = [
  /^banking\s+app\s+/i,
  /^recurring\s+card\s+purchase:\s*/i,
  /^international\s+online\s+purchase(?:\s+insufficient\s+funds\s+fee)?:\s*/i,
  /^online\s+purchase:\s*/i,
  /^card\s+purchase(?:\s+insufficient\s+funds\s+fee)?:\s*/i,
  /^purchase\s+with\s+card\s+at(?:\s+epos(?:\s+at)?)?\s*/i,
  /^payment\s+received:\s*/i,
  /^payshap\s+payment\s+received:\s*/i,
  /^banking\s+app\s+transfer\s+received\s+from\s+/i,
  /^transfer\s+received\s+from\s+/i,
  /^payment\s+to\s+/i,
  /^payment\s+from\s+/i,
  /^immediate\s+payment\s+(?:to|from)\s+/i,
  /^eft\s+(?:to|from|for)\s+/i,
  /^rtc\s+/i,
  /^pos\s+purchase\s+/i,
  /^dl\*/i,
];

const STRIP_SUFFIXES = [
  /\s*\(card\s*\d+\)\s*$/i,
  /\s*\([^)]{4,}\)\s*$/i,
  /\s*:\s*transfer\s*$/i,
  /\s+gb\s*$/i,
  /\s+za\s*$/i,
];

const NOISE_TOKENS = new Set([
  "card",
  "purchase",
  "recurring",
  "online",
  "international",
  "insufficient",
  "funds",
  "fee",
  "banking",
  "app",
  "transfer",
  "received",
  "payment",
  "cellphone",
  "phone",
  "from",
  "to",
  "for",
  "the",
  "and",
]);

export function extractMerchantCandidate(
  description: string | null | undefined,
): string | null {
  let text = description?.trim() ?? "";
  if (!text) return null;

  for (const pattern of STRIP_PREFIXES) {
    text = text.replace(pattern, "");
  }
  for (const pattern of STRIP_SUFFIXES) {
    text = text.replace(pattern, "");
  }

  text = text.replace(/\s+/g, " ").replace(/^[\s\-:/]+|[\s\-:/]+$/g, "").trim();
  if (!text) return null;

  const tokens = text.split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const token of tokens) {
    const bare = token.replace(/[^a-zA-Z0-9&']/g, "");
    if (!bare) break;
    if (/^\d+$/.test(bare)) break;
    if (NOISE_TOKENS.has(bare.toLowerCase()) && kept.length === 0) {
      continue;
    }
    kept.push(token);
    if (kept.length >= 4) break;
  }

  if (kept.length === 0) return null;
  const label = kept.join(" ").trim();
  if (label.replace(/[^a-zA-Z0-9]/g, "").length < 3) return null;
  return label;
}

export function looksLikePaymentReceived(
  description: string | null | undefined,
  type: string | null | undefined,
): boolean {
  if (type === "debit") return false;
  return /\b(?:payment\s+received|transfer\s+received|money\s+received)\b/i.test(
    description ?? "",
  );
}

export function looksLikeAirtimeAdvance(
  description: string | null | undefined,
): boolean {
  return /\bairtime\s*adv(?:ance)?\b/i.test(description ?? "");
}

export function initialsFromLabel(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-zA-Z]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}
