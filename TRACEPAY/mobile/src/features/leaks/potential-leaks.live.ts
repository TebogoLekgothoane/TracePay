/**
 * Map live leak detections into the PotentialLeak shape the Leaks tab and
 * FindingReview already render. No invented merchants or amounts.
 */

import { formatRandAmount } from "../../utils/currency";
import {
  belongsToCategory,
  countsAsLeak,
  isVisibleLeak,
  LEAK_DEBUG_CATEGORIES,
} from "../leak-intelligence/leak-debug-categories";
import type { LeakDetection, LeakDetectionResult } from "../leak-intelligence/leak-intelligence.types";
import type { PotentialLeak, ReviewIcon, ReviewStatus, ReviewTransaction } from "./potential-leaks";

function statusFromDetection(status: string): ReviewStatus {
  if (status === "resolved" || status === "dismissed") return "resolved";
  if (status === "monitoring") return "unchanged";
  return "new";
}

function iconForType(leakType: string): ReviewIcon {
  if (leakType.includes("duplicate")) return "copy";
  if (leakType.includes("subscription") || leakType.includes("recurring")) return "refresh";
  if (leakType.includes("fee") || leakType.includes("airtime")) return "receipt";
  if (leakType.includes("spending") || leakType.includes("habit")) return "activity";
  return "calendar";
}

function relatedLeakId(leakType: string): string | null {
  for (const category of LEAK_DEBUG_CATEGORIES) {
    if (category.key === "other") continue;
    if (category.leakTypes.includes(leakType)) return category.key;
  }
  return null;
}

function transactionRows(leak: LeakDetection): ReviewTransaction[] {
  return (leak.supporting_transactions ?? []).slice(0, 8).map((row, index) => {
    const direction: "debit" | "credit" =
      String(row.direction).toLowerCase().startsWith("c") || row.role === "reversal"
        ? "credit"
        : "debit";
    const roleLabel =
      row.role === "reversal"
        ? "Reversal"
        : row.role === "fee" || row.role === "other_fee" || row.role === "failed_attempt_fee"
          ? "Fee"
          : "";
    const date = row.date ? String(row.date).slice(0, 10) : "";
    const description = (row.description || "Transaction").trim();
    return {
      id: row.transaction_id || `${leak.fingerprint}:${index}`,
      title: description,
      description,
      direction,
      subtitle: [roleLabel, date].filter(Boolean).join(" · "),
      amount: `${direction === "debit" ? "-" : "+"}R${Math.abs(Number(row.amount) || 0).toFixed(2)}`,
    };
  });
}

function evidenceRows(leak: LeakDetection): { label: string; value: string }[] {
  const monthly = Number(leak.estimated_monthly_impact);
  const rows: { label: string; value: string }[] = [];
  if (Number.isFinite(monthly) && monthly > 0) {
    rows.push({ label: "Monthly impact", value: formatRandAmount(monthly) });
  }
  if (leak.supporting_transaction_count > 0) {
    rows.push({
      label: "Transactions",
      value: String(leak.supporting_transaction_count),
    });
  }
  if (typeof leak.confidence === "number" && leak.confidence > 0) {
    const percent = leak.confidence <= 1 ? Math.round(leak.confidence * 100) : Math.round(leak.confidence);
    rows.push({ label: "Confidence", value: `${percent}%` });
  }
  return rows;
}

export function potentialLeakFromDetection(leak: LeakDetection): PotentialLeak {
  const monthly = Number(leak.estimated_monthly_impact);
  const amount = Number.isFinite(monthly) && monthly > 0 ? formatRandAmount(monthly) : "—";
  const known = (leak.claims?.confirmed ?? []).map((fact) => fact.text);
  const uncertain = (leak.claims?.possible ?? []).map((claim) => claim.text);
  const steps = (leak.claims?.possible ?? [])
    .filter((claim) => Boolean(claim.check))
    .map((claim) => ({
      title: "Check this",
      detail: claim.check as string,
    }));
  return {
    id: leak.fingerprint || leak.leak_id,
    title: leak.title,
    amount,
    listAmount: Number.isFinite(monthly) && monthly > 0 ? `${amount} a month` : undefined,
    subtitle: leak.description,
    description: leak.description,
    status: statusFromDetection(leak.status),
    priority: Math.round((leak.confidence <= 1 ? leak.confidence : leak.confidence / 100) * 100),
    icon: iconForType(leak.leak_type),
    why: known.length > 0 ? known.slice(0, 3).join(" ") : leak.description,
    evidence: evidenceRows(leak),
    transactions: transactionRows(leak),
    steps,
    known,
    uncertain,
    relatedLeakId: relatedLeakId(leak.leak_type),
    nextCharge: "",
  };
}

function openLeakDetections(result: LeakDetectionResult | null | undefined): LeakDetection[] {
  if (!result) return [];
  return result.leaks.filter((leak) => {
    if (!isVisibleLeak(leak) || !countsAsLeak(leak)) return false;
    const open = leak.status === "active" || leak.status === "monitoring";
    if (!open) return false;
    if (leak.analysis?.counted_in_total === false) return false;
    return Number(leak.estimated_monthly_impact) > 0 || leak.supporting_transaction_count > 0;
  });
}

/** Open, visible findings for the Leaks tab — from the live analysis only. */
export function listLivePotentialLeaks(result: LeakDetectionResult | null | undefined): PotentialLeak[] {
  return openLeakDetections(result).map(potentialLeakFromDetection);
}

/** Exact monthly total of the findings the tab lists (same filter, nothing dropped or doubled). */
export function liveLeaksMonthlyTotal(result: LeakDetectionResult | null | undefined): number {
  return openLeakDetections(result).reduce((sum, leak) => {
    const value = Number(leak.estimated_monthly_impact);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}

/** Findings that belong to one Leaks-tab category (fees / subs / …). */
export function listLiveCategoryFindings(
  result: LeakDetectionResult | null | undefined,
  categoryKey: string,
): PotentialLeak[] {
  const category = LEAK_DEBUG_CATEGORIES.find((entry) => entry.key === categoryKey);
  if (!result || !category) return [];
  return result.leaks
    .filter(
      (leak) =>
        isVisibleLeak(leak) &&
        belongsToCategory(category, leak) &&
        (leak.status === "active" || leak.status === "monitoring"),
    )
    .map(potentialLeakFromDetection);
}
