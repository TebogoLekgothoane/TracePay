import { CATEGORY_ICONS } from "@/constants/category-icons";
import {
  BANK_DOMAINS,
  MERCHANT_CATALOG,
  hunterLogoUrl,
} from "@/constants/merchants";
import { ParsedTransaction } from "@/services/sms/sms.types";

export type TransactionLogoSource =
  | { kind: "hunter"; uri: string; domain: string }
  | { kind: "icon"; name: string };

export function resolveMerchantDomain(merchant: string): string | null {
  const text = merchant.trim();
  if (!text) return null;

  for (const entry of MERCHANT_CATALOG) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return entry.domain;
    }
  }

  return null;
}

function resolveBankDomain(bank: string): string | null {
  return BANK_DOMAINS[bank] ?? null;
}

type LogoResolutionInput = Pick<ParsedTransaction, "merchant" | "bank" | "category">;

/**
 * Resolve Hunter logo domain from enriched transaction fields.
 * Called at parse/enrich time — not from UI.
 */
export function resolveLogoDomain(tx: LogoResolutionInput): string | undefined {
  if (tx.merchant) {
    const merchantDomain = resolveMerchantDomain(tx.merchant);
    if (merchantDomain) return merchantDomain;
  }

  const useBankLogo =
    !tx.merchant?.trim() || tx.category === "atm" || tx.category === "transfer";

  if (useBankLogo) {
    const bankDomain = resolveBankDomain(tx.bank);
    if (bankDomain) return bankDomain;
  }

  return undefined;
}

/** Attach resolved logo domain to a transaction record. */
export function withLogoDomain(tx: ParsedTransaction): ParsedTransaction {
  const logoDomain = resolveLogoDomain(tx);
  if (logoDomain) {
    return { ...tx, logoDomain };
  }

  if (tx.logoDomain === undefined) {
    return tx;
  }

  const { logoDomain: _removed, ...rest } = tx;
  return rest;
}

/** Read stored logo domain for display; falls back to live resolution for legacy rows. */
export function resolveTransactionLogo(tx: ParsedTransaction): TransactionLogoSource {
  const domain = tx.logoDomain ?? resolveLogoDomain(tx);

  if (domain) {
    return {
      kind: "hunter",
      uri: hunterLogoUrl(domain),
      domain,
    };
  }

  return { kind: "icon", name: CATEGORY_ICONS[tx.category] };
}
