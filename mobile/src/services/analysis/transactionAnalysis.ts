import {
  analyzeTransactions,
  type AnalyzeResponse,
  type AnalyzeTransaction,
  type BackendMoneyLeak,
} from "../../../lib/backend-client";
import type { ParsedTransaction } from "@/services/sms/sms.types";
import { pipelineError, pipelineLog } from "@/lib/pipeline-log";

const MAX_ANALYSIS_TRANSACTIONS = 500;
const ANALYSIS_RETRY_DELAY_MS = 1_000;

export interface MobileAnalysisLeak {
  analysisId: string;
  name: string;
  category: string;
  categoryIcon: string;
  amountMonthly: number;
  severity: "low" | "medium" | "high";
  advice: string;
  createdAt: string;
}

export interface MobileAnalysisReport {
  healthScore: number;
  healthBand: "green" | "yellow" | "red";
  summary: string;
  analyzedAt: string;
  leaks: MobileAnalysisLeak[];
}

function analysisTransactionFrom(
  transaction: ParsedTransaction,
  source: "sms" | "demo"
): AnalyzeTransaction | null {
  if (
    !transaction.id ||
    !Number.isFinite(transaction.amount) ||
    transaction.amount <= 0 ||
    !(transaction.timestamp instanceof Date) ||
    Number.isNaN(transaction.timestamp.getTime()) ||
    (transaction.type !== "debit" && transaction.type !== "credit")
  ) {
    return null;
  }

  return {
    id: transaction.id,
    timestamp: transaction.timestamp.toISOString(),
    amount: transaction.amount,
    currency: transaction.currency,
    description: transaction.summary ?? transaction.merchant ?? "Transaction",
    merchant: transaction.merchant,
    category: transaction.category,
    direction: transaction.type,
    channel: source,
    meta: {
      provider: transaction.bank,
      confidence: transaction.confidence,
    },
  };
}

function assertAnalyzeResponse(value: AnalyzeResponse): AnalyzeResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isInteger(value.financial_health_score) ||
    value.financial_health_score < 0 ||
    value.financial_health_score > 100 ||
    !["green", "yellow", "red"].includes(value.health_band) ||
    typeof value.summary_plain_language !== "string" ||
    !Array.isArray(value.money_leaks)
  ) {
    throw new Error("The backend returned an invalid analysis report.");
  }

  for (const leak of value.money_leaks) {
    if (
      typeof leak.id !== "string" ||
      typeof leak.detector !== "string" ||
      typeof leak.title !== "string" ||
      typeof leak.plain_language_reason !== "string" ||
      !["low", "medium", "high"].includes(leak.severity) ||
      (leak.estimated_monthly_cost != null &&
        (!Number.isFinite(leak.estimated_monthly_cost) ||
          leak.estimated_monthly_cost < 0))
    ) {
      throw new Error("The backend returned an invalid money-leak record.");
    }
  }

  return value;
}

function iconForLeak(leak: BackendMoneyLeak): string {
  const text = `${leak.detector} ${leak.title}`.toLowerCase();
  if (/airtime|data|vas|mobile/.test(text)) return "cellphone";
  if (/subscription|stream|recurring/.test(text)) return "calendar-refresh";
  if (/fee|charge|cash-out|atm/.test(text)) return "cash-minus";
  if (/debit.order|debit order/.test(text)) return "bank-transfer-out";
  if (/weekend|spending/.test(text)) return "chart-line";
  return "alert-circle-outline";
}

function mobileLeakFrom(leak: BackendMoneyLeak): MobileAnalysisLeak {
  return {
    analysisId: leak.id,
    name: leak.title,
    category: leak.detector,
    categoryIcon: iconForLeak(leak),
    amountMonthly: leak.estimated_monthly_cost ?? 0,
    severity: leak.severity,
    advice: leak.plain_language_reason,
    createdAt: new Date().toISOString(),
  };
}

async function requestAnalysisWithRetry(
  transactions: AnalyzeTransaction[],
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  try {
    pipelineLog("analyze.request.attempt", { attempt: 1, count: transactions.length });
    return assertAnalyzeResponse(await analyzeTransactions(transactions, signal));
  } catch (error) {
    if (signal?.aborted) throw error;
    pipelineError("analyze.request.attempt1", error);
    pipelineLog("analyze.request.retry", { attempt: 2, delayMs: ANALYSIS_RETRY_DELAY_MS });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, ANALYSIS_RETRY_DELAY_MS);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(new Error("Analysis request was cancelled."));
        },
        { once: true }
      );
    });

    return assertAnalyzeResponse(await analyzeTransactions(transactions, signal));
  }
}

/**
 * Prepares the minimum permitted payload and delegates all financial
 * investigation to the backend. Raw SMS data never enters this request.
 */
export async function analyzeMobileTransactions(
  transactions: ParsedTransaction[],
  source: "sms" | "demo",
  signal?: AbortSignal
): Promise<MobileAnalysisReport> {
  pipelineLog("analyze.prepare", {
    source,
    inputCount: transactions.length,
    maxAllowed: MAX_ANALYSIS_TRANSACTIONS,
  });

  const payload = transactions
    .slice(0, MAX_ANALYSIS_TRANSACTIONS)
    .map((transaction) => analysisTransactionFrom(transaction, source))
    .filter((transaction): transaction is AnalyzeTransaction => transaction !== null);

  pipelineLog("analyze.payload", {
    payloadCount: payload.length,
    sampleProviders: payload.slice(0, 5).map((tx) => tx.meta.provider),
    sampleDirections: payload.slice(0, 5).map((tx) => tx.direction),
  });

  if (payload.length === 0) {
    throw new Error("No valid transactions are available for analysis.");
  }

  try {
    const result = await requestAnalysisWithRetry(payload, signal);
    pipelineLog("analyze.response", {
      healthScore: result.financial_health_score,
      healthBand: result.health_band,
      leakCount: result.money_leaks.length,
      leakIds: result.money_leaks.slice(0, 5).map((leak) => leak.id),
    });
    return {
      healthScore: result.financial_health_score,
      healthBand: result.health_band,
      summary: result.summary_plain_language.trim().slice(0, 1_000),
      analyzedAt: new Date().toISOString(),
      leaks: result.money_leaks.map(mobileLeakFrom),
    };
  } catch (error) {
    pipelineError("analyze", error);
    throw error;
  }
}
