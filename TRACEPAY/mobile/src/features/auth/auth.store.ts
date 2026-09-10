import { useSyncExternalStore } from "react";

import type { AuthProfile } from "./auth.types";

export type ProfileSnapshot = {
  profile: AuthProfile | null;
  loading: boolean;
  error: string | null;
};

const emptySnapshot: ProfileSnapshot = {
  profile: null,
  loading: false,
  error: null,
};

let snapshot: ProfileSnapshot = emptySnapshot;
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

export function getProfileSnapshot(): ProfileSnapshot {
  return snapshot;
}

export function setProfileSnapshot(next: ProfileSnapshot): void {
  snapshot = next;
  emit();
}

export function resetProfileSnapshot(): void {
  snapshot = emptySnapshot;
  emit();
}

export function useProfileSnapshot(): ProfileSnapshot {
  return useSyncExternalStore(subscribe, getProfileSnapshot, getProfileSnapshot);
}
