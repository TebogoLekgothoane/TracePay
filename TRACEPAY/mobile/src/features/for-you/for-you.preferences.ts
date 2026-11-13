import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import {
  FOR_YOU_FEED_LIMIT,
  isForYouCardId,
  visibleForYouCards,
} from "./for-you.cards";

const DISMISSED_KEY = "tracepay.for-you.dismissed.v1";
const MAX_STORED_IDS = 32;

type ForYouPreferencesSnapshot = {
  dismissedIds: readonly string[];
  hydrated: boolean;
};

let snapshot: ForYouPreferencesSnapshot = {
  dismissedIds: [],
  hydrated: false,
};

let hydrateRequest: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: ForYouPreferencesSnapshot): void {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ForYouPreferencesSnapshot {
  return snapshot;
}

function sanitizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!isForYouCardId(id)) return null;
  return id;
}

function parseDismissedIds(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const unique = new Set<string>();
    for (const value of parsed) {
      const id = sanitizeId(value);
      if (!id) continue;
      unique.add(id);
      if (unique.size >= MAX_STORED_IDS) break;
    }
    return [...unique];
  } catch {
    return [];
  }
}

async function persistDismissedIds(ids: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // Keep the in-memory dismissal even if persistence fails.
  }
}

export async function hydrateForYouPreferences(): Promise<void> {
  if (snapshot.hydrated) {
    return;
  }
  if (hydrateRequest) {
    return hydrateRequest;
  }

  hydrateRequest = (async () => {
    try {
      const stored = await AsyncStorage.getItem(DISMISSED_KEY);
      const merged = [
        ...new Set([
          ...parseDismissedIds(stored),
          ...getSnapshot().dismissedIds,
        ]),
      ];
      setSnapshot({
        dismissedIds: merged,
        hydrated: true,
      });
    } catch {
      setSnapshot({
        dismissedIds: getSnapshot().dismissedIds,
        hydrated: true,
      });
    } finally {
      hydrateRequest = null;
    }
  })();

  return hydrateRequest;
}

export async function dismissForYouCard(cardId: string): Promise<void> {
  const id = sanitizeId(cardId);
  if (!id) return;

  const current = getSnapshot();
  if (current.dismissedIds.includes(id)) {
    if (!current.hydrated) {
      await hydrateForYouPreferences();
    }
    return;
  }

  const dismissedIds = [...current.dismissedIds, id];
  setSnapshot({
    dismissedIds,
    hydrated: current.hydrated,
  });

  if (!current.hydrated) {
    await hydrateForYouPreferences();
    await persistDismissedIds(getSnapshot().dismissedIds);
    return;
  }

  await persistDismissedIds(dismissedIds);
}

export function useForYouCards(limit = FOR_YOU_FEED_LIMIT) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void hydrateForYouPreferences();
  }, []);

  const cards = useMemo(
    () => visibleForYouCards(current.dismissedIds, limit),
    [current.dismissedIds, limit],
  );

  const ignore = useCallback(async (cardId: string) => {
    await dismissForYouCard(cardId);
  }, []);

  return {
    cards,
    hydrated: current.hydrated,
    ignore,
  };
}
