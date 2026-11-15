import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { formatRandAmount, parseRandAmount } from "../../utils/currency";
import type { RecurringCharge } from "./recurring-charges.catalog";

const STORAGE_KEY = "tracepay.recurring-calendar.custom.v1";
const MAX_CUSTOM_CHARGES = 40;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type CustomChargeInput = {
  name: string;
  amount: string;
  day: number;
  cadence: "monthly" | "yearly";
  /** 0–11; used when cadence is yearly so the charge lands in a real month. */
  month?: number;
  category?: string;
};

type CustomChargesSnapshot = {
  charges: readonly RecurringCharge[];
  hydrated: boolean;
};

let snapshot: CustomChargesSnapshot = {
  charges: [],
  hydrated: false,
};

let hydrateRequest: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: CustomChargesSnapshot): void {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CustomChargesSnapshot {
  return snapshot;
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

function markFromName(name: string): string {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
}

function sanitizeCharge(value: unknown): RecurringCharge | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.startsWith("custom-")) return null;
  if (typeof row.name !== "string") return null;

  const name = row.name.trim().slice(0, 48);
  if (name.length < 2) return null;

  const amountRaw =
    typeof row.amount === "string"
      ? row.amount
      : typeof row.amount === "number"
        ? String(row.amount)
        : "";
  const amountValue = parseRandAmount(amountRaw.startsWith("R") ? amountRaw : `R${amountRaw}`);
  if (!(amountValue > 0) || amountValue > 1_000_000) return null;

  const day =
    typeof row.day === "number"
      ? row.day
      : typeof row.billingDate === "string"
        ? Number((row.billingDate.match(/(\d{1,2})/) ?? [])[1])
        : NaN;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const cadence = row.cadence === "yearly" || row.billing === "Billed yearly" ? "yearly" : "monthly";
  const category =
    typeof row.category === "string" && row.category.trim()
      ? row.category.trim().slice(0, 32)
      : "Other";
  const billingDate =
    typeof row.billingDate === "string" && row.billingDate.trim().length > 0
      ? row.billingDate.trim().slice(0, 48)
      : cadence === "yearly"
        ? `${ordinal(day)} of ${MONTH_NAMES[new Date().getMonth()]}`
        : `${ordinal(day)} of each month`;

  return {
    id: row.id,
    name,
    kind: "custom",
    category,
    billing: cadence === "yearly" ? "Billed yearly" : "Billed monthly",
    billingDate,
    amount: formatRandAmount(amountValue),
    status: "Active",
    mark: markFromName(name),
  };
}

function parseCharges(raw: string | null): RecurringCharge[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecurringCharge[] = [];
    for (const value of parsed) {
      const charge = sanitizeCharge(value);
      if (!charge) continue;
      out.push(charge);
      if (out.length >= MAX_CUSTOM_CHARGES) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function persist(charges: readonly RecurringCharge[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(charges));
  } catch {
    // Keep in-memory state if persistence fails.
  }
}

export async function hydrateCustomCharges(): Promise<void> {
  if (snapshot.hydrated) return;
  if (hydrateRequest) return hydrateRequest;

  hydrateRequest = (async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      setSnapshot({
        charges: parseCharges(stored),
        hydrated: true,
      });
    } catch {
      setSnapshot({ ...getSnapshot(), hydrated: true });
    } finally {
      hydrateRequest = null;
    }
  })();

  return hydrateRequest;
}

export function createCustomCharge(input: CustomChargeInput): RecurringCharge | null {
  const name = input.name.trim().slice(0, 48);
  if (name.length < 2) return null;

  const amountValue = parseRandAmount(
    input.amount.trim().startsWith("R") ? input.amount.trim() : `R${input.amount.trim()}`,
  );
  if (!(amountValue > 0) || amountValue > 1_000_000) return null;

  const day = Math.trunc(input.day);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const cadence = input.cadence === "yearly" ? "yearly" : "monthly";
  const category = (input.category?.trim() || "Other").slice(0, 32);
  const monthIndex =
    typeof input.month === "number" && input.month >= 0 && input.month <= 11
      ? input.month
      : new Date().getMonth();
  const billingDate =
    cadence === "yearly"
      ? `${ordinal(day)} of ${MONTH_NAMES[monthIndex]}`
      : `${ordinal(day)} of each month`;

  return {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    kind: "custom",
    category,
    billing: cadence === "yearly" ? "Billed yearly" : "Billed monthly",
    billingDate,
    amount: formatRandAmount(amountValue),
    status: "Active",
    mark: markFromName(name),
  };
}

export function useCustomCharges() {
  useEffect(() => {
    void hydrateCustomCharges();
  }, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const addCharge = useCallback(async (input: CustomChargeInput) => {
    const charge = createCustomCharge(input);
    if (!charge) return null;

    const next = [charge, ...getSnapshot().charges].slice(0, MAX_CUSTOM_CHARGES);
    setSnapshot({ charges: next, hydrated: true });
    await persist(next);
    return charge;
  }, []);

  const removeCharge = useCallback(async (id: string) => {
    if (!id.startsWith("custom-")) return;
    const next = getSnapshot().charges.filter((item) => item.id !== id);
    setSnapshot({ charges: next, hydrated: true });
    await persist(next);
  }, []);

  return {
    charges: state.charges,
    hydrated: state.hydrated,
    addCharge,
    removeCharge,
  };
}
