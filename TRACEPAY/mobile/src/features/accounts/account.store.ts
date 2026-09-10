import { useSyncExternalStore } from "react";

import type { FinancialAccount } from "./account.types";

export type AccountsSnapshot = {
  accounts: FinancialAccount[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
};

const emptySnapshot: AccountsSnapshot = {
  accounts: [],
  loading: false,
  error: null,
  initialized: false,
};

let snapshot: AccountsSnapshot = emptySnapshot;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAccountsSnapshot(): AccountsSnapshot {
  return snapshot;
}

export function setAccountsSnapshot(next: AccountsSnapshot): void {
  snapshot = next;
  emit();
}

export function resetAccountsSnapshot(): void {
  snapshot = emptySnapshot;
  emit();
}

export function useAccountsSnapshot(): AccountsSnapshot {
  return useSyncExternalStore(subscribe, getAccountsSnapshot, getAccountsSnapshot);
}
