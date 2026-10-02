import { requireAuthenticatedUserId } from "../accounts/account.service";
import { getSupabase } from "../../lib/supabase";
import { formatRandAmount } from "../../utils/currency";

export type FinancialOverview = {
  moneyIn: number;
  moneyOut: number;
  transferVolume: number;
  leakSpend: number;
  duplicateCount: number;
  transactionCount: number;
};

function readOverview(value: unknown): FinancialOverview {
  const parsed =
    typeof value === "string"
      ? (JSON.parse(value) as Record<string, unknown>)
      : ((value ?? {}) as Record<string, unknown>);
  return {
    moneyIn: Number(parsed.money_in ?? 0),
    moneyOut: Number(parsed.money_out ?? 0),
    transferVolume: Number(parsed.transfer_volume ?? 0),
    leakSpend: Number(parsed.leak_spend ?? 0),
    duplicateCount: Number(parsed.duplicate_count ?? 0),
    transactionCount: Number(parsed.transaction_count ?? 0),
  };
}

export async function loadFinancialOverview(
  accountId?: string | null,
): Promise<FinancialOverview> {
  await requireAuthenticatedUserId();
  const { data, error } = await getSupabase().rpc("financial_overview", {
    p_account_id: accountId ?? null,
  });

  if (error) {
    throw new Error("Could not load your financial overview.");
  }

  return readOverview(data);
}

export function formatOverviewAmount(value: number): string {
  return formatRandAmount(value);
}
