import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { getUserId } from "@/constants/api";
import type {
  MobileAnalysisReport,
} from "@/services/analysis/transactionAnalysis";
import { hashString } from "@/services/sms/sms.utils";

export interface Leak {
  id: number;
  analysisId?: string;
  name: string;
  category: string;
  categoryIcon: string;
  amountMonthly: number;
  severity: string;
  status: string;
  sourceSms?: string;
  advice?: string;
  createdAt?: string;
}

export interface AnalysisSummary {
  healthScore: number;
  healthBand: "green" | "yellow" | "red";
  summary: string;
  analyzedAt: string;
}

async function leaksStorageKey() {
  const userId = await getUserId();
  return `@tracepay:leaks:${userId}`;
}

async function analysisStorageKey() {
  const userId = await getUserId();
  return `@tracepay:analysis:${userId}`;
}

/** Legacy demo leaks seeded in earlier builds — strip on load. */
const LEGACY_DEMO_LEAK_NAMES = new Set([
  "iflix Subscription",
  "Capitec Loan Interest",
  "Vodacom Airtime Advance Fee",
  "Cross-Bank ATM Fee",
]);

function stripLegacyDemoLeaks(leaks: Leak[]) {
  return leaks.filter((l) => !LEGACY_DEMO_LEAK_NAMES.has(l.name));
}

async function loadLeaks(): Promise<Leak[]> {
  const raw = await AsyncStorage.getItem(await leaksStorageKey());
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Leak[];
    const cleaned = stripLegacyDemoLeaks(parsed);
    if (cleaned.length !== parsed.length) {
      await saveLeaks(cleaned);
    }
    return cleaned;
  } catch {
    return [];
  }
}

async function saveLeaks(leaks: Leak[]) {
  await AsyncStorage.setItem(await leaksStorageKey(), JSON.stringify(leaks));
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

async function saveAnalysis(analysis: AnalysisSummary) {
  await AsyncStorage.setItem(
    await analysisStorageKey(),
    JSON.stringify(analysis)
  );
}

interface LeaksState {
  leaks: Leak[];
  analysis: AnalysisSummary | null;
  isLoading: boolean;
  error: string | null;
  fetchLeaks: () => Promise<void>;
  addLeaks: (leaks: Omit<Leak, "id" | "createdAt">[]) => Promise<void>;
  replaceWithAnalysis: (report: MobileAnalysisReport) => Promise<void>;
  freezeLeak: (id: number) => Promise<void>;
  resetLeaks: () => void;
}

export const DEFAULT_MONTHLY_INCOME = 8500;

export function getActiveLeaks(leaks: Leak[]) {
  return leaks.filter((l) => l.status === "active");
}

export function getActiveLeakStats(leaks: Leak[]) {
  const activeLeaks = getActiveLeaks(leaks);
  const totalMonthly = activeLeaks.reduce((sum, l) => sum + l.amountMonthly, 0);
  return { activeLeaks, count: activeLeaks.length, totalMonthly };
}

export const useLeaksStore = create<LeaksState>((set, get) => ({
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

  addLeaks: async (leaksData) => {
    const existing = get().leaks;
    const inserted = leaksData.map((l, index) => ({
      ...l,
      id: Date.now() + index,
      categoryIcon: l.categoryIcon ?? "alert-circle-outline",
      status: l.status ?? "active",
      createdAt: new Date().toISOString(),
    }));
    const merged = [...existing, ...inserted];
    await saveLeaks(merged);
    set({ leaks: merged });
  },

  replaceWithAnalysis: async (report) => {
    const leaks = report.leaks.map((leak) => ({
      id: Number.parseInt(hashString(leak.analysisId), 16),
      analysisId: leak.analysisId,
      name: leak.name,
      category: leak.category,
      categoryIcon: leak.categoryIcon,
      amountMonthly: leak.amountMonthly,
      severity: leak.severity,
      status: "active",
      advice: leak.advice,
      createdAt: leak.createdAt,
    }));
    const analysis: AnalysisSummary = {
      healthScore: report.healthScore,
      healthBand: report.healthBand,
      summary: report.summary,
      analyzedAt: report.analyzedAt,
    };
    await Promise.all([saveLeaks(leaks), saveAnalysis(analysis)]);
    set({
      leaks,
      analysis,
      error: null,
    });
  },

  freezeLeak: async (id) => {
    const updated = get().leaks.map((l) =>
      l.id === id ? { ...l, status: "frozen" } : l,
    );
    await saveLeaks(updated);
    set({ leaks: updated });
  },

  resetLeaks: () => {
    set({ leaks: [], analysis: null, isLoading: false, error: null });
  },
}));
