import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { getUserId } from "@/constants/api";

export interface Leak {
  id: number;
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

async function leaksStorageKey() {
  const userId = await getUserId();
  return `@tracepay:leaks:${userId}`;
}

async function loadLeaks(): Promise<Leak[]> {
  const raw = await AsyncStorage.getItem(await leaksStorageKey());
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Leak[];
  } catch {
    return [];
  }
}

async function saveLeaks(leaks: Leak[]) {
  await AsyncStorage.setItem(await leaksStorageKey(), JSON.stringify(leaks));
}

interface LeaksState {
  leaks: Leak[];
  isLoading: boolean;
  error: string | null;
  fetchLeaks: () => Promise<void>;
  addLeaks: (leaks: Omit<Leak, "id" | "createdAt">[]) => Promise<void>;
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
  isLoading: false,
  error: null,

  fetchLeaks: async () => {
    set({ isLoading: true, error: null });
    try {
      const leaks = await loadLeaks();
      set({ leaks });
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

  freezeLeak: async (id) => {
    const updated = get().leaks.map((l) =>
      l.id === id ? { ...l, status: "frozen" } : l,
    );
    await saveLeaks(updated);
    set({ leaks: updated });
  },

  resetLeaks: () => {
    set({ leaks: [], isLoading: false, error: null });
  },
}));
