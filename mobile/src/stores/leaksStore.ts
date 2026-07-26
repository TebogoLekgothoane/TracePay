import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { getUserId } from "@/constants/api";
import {
  loadStoredLeaks,
  saveStoredLeaks,
} from "@/services/transactions/transactionRepository";
import type { LifecycleLeak } from "../../lib/backend-client";

export interface Leak {
  id: string;
  fiCode?: string;
  name: string;
  category: string;
  categoryIcon: string;
  amountMonthly: number;
  severity: string;
  status: string;
  sourceSms?: string;
  advice?: string;
  evidence?: Record<string, unknown>;
  resolvedAt?: string | null;
  createdAt?: string;
}

export interface AnalysisSummary {
  healthScore: number;
  healthBand: "green" | "yellow" | "red";
  summary: string;
  analyzedAt: string;
}

async function analysisStorageKey() {
  const userId = await getUserId();
  return `@tracepay:analysis:${userId}`;
}

async function loadLeaks(): Promise<Leak[]> {
  const stored = await loadStoredLeaks(await getUserId());
  return stored.map(leakFromLifecycle);
}

async function loadAnalysis(): Promise<AnalysisSummary | null> {
  const raw = await AsyncStorage.getItem(await analysisStorageKey());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AnalysisSummary;
    if (
      !Number.isInteger(parsed.healthScore) ||
      parsed.healthScore < 0 ||
      parsed.healthScore > 100 ||
      !["green", "yellow", "red"].includes(parsed.healthBand) ||
      typeof parsed.summary !== "string" ||
      Number.isNaN(new Date(parsed.analyzedAt).getTime())
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

interface LeaksState {
  leaks: Leak[];
  analysis: AnalysisSummary | null;
  isLoading: boolean;
  error: string | null;
  fetchLeaks: () => Promise<void>;
  replaceWithLifecycle: (leaks: LifecycleLeak[]) => Promise<void>;
  resetLeaks: () => void;
}

export const DEFAULT_MONTHLY_INCOME = 8500;

export function getActiveLeaks(leaks: Leak[]) {
  return leaks.filter((l) => l.status === "active");
}

function leakFromLifecycle(leak: LifecycleLeak): Leak {
  return {
    id: leak.id,
    fiCode: leak.fi_code,
    name: leak.merchant ?? leak.fi_code,
    category: leak.fi_code,
    categoryIcon: "alert-circle-outline",
    amountMonthly: leak.amount_monthly,
    severity: "medium",
    status: leak.status,
    advice: leak.exact_action,
    evidence: leak.evidence,
    resolvedAt: leak.resolved_at,
    createdAt: leak.detected_at,
  };
}

export function getActiveLeakStats(leaks: Leak[]) {
  const activeLeaks = getActiveLeaks(leaks);
  const totalMonthly = activeLeaks.reduce((sum, l) => sum + l.amountMonthly, 0);
  return { activeLeaks, count: activeLeaks.length, totalMonthly };
}

export const useLeaksStore = create<LeaksState>((set) => ({
  leaks: [],
  analysis: null,
  isLoading: false,
  error: null,

  fetchLeaks: async () => {
    set({ isLoading: true, error: null });
    try {
      const [leaks, analysis] = await Promise.all([loadLeaks(), loadAnalysis()]);
      set({ leaks, analysis });
    } catch {
      set({ error: "Failed to load leaks" });
    } finally {
      set({ isLoading: false });
    }
  },

  replaceWithLifecycle: async (lifecycleLeaks) => {
    const leaks = lifecycleLeaks.map(leakFromLifecycle);
    await saveStoredLeaks(await getUserId(), lifecycleLeaks);
    set({ leaks, error: null });
  },

  resetLeaks: () => {
    set({ leaks: [], analysis: null, isLoading: false, error: null });
  },
}));
