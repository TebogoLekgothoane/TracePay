import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";

const FINANCIAL_CONSENT_KEY = "tracepay.consent.financial.v1";

export type FinancialConsentPreferences = {
  accepted: boolean;
  acceptedAt: string | null;
};

type Snapshot = FinancialConsentPreferences & {
  hydrated: boolean;
};

const DEFAULT: FinancialConsentPreferences = {
  accepted: false,
  acceptedAt: null,
};

let snapshot: Snapshot = {
  ...DEFAULT,
  hydrated: false,
};

let hydrateRequest: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: Snapshot): void {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function parseStored(raw: string | null): FinancialConsentPreferences {
  if (!raw) {
    return { ...DEFAULT };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FinancialConsentPreferences>;
    return {
      accepted: Boolean(parsed.accepted),
      acceptedAt:
        typeof parsed.acceptedAt === "string" && parsed.acceptedAt.trim()
          ? parsed.acceptedAt
          : null,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function hydrateFinancialConsent(): Promise<void> {
  if (snapshot.hydrated) {
    return;
  }
  if (hydrateRequest) {
    return hydrateRequest;
  }

  hydrateRequest = (async () => {
    try {
      const stored = await AsyncStorage.getItem(FINANCIAL_CONSENT_KEY);
      setSnapshot({
        ...parseStored(stored),
        hydrated: true,
      });
    } catch {
      setSnapshot({
        ...DEFAULT,
        hydrated: true,
      });
    } finally {
      hydrateRequest = null;
    }
  })();

  return hydrateRequest;
}

export async function saveFinancialConsent(input: {
  accepted: boolean;
}): Promise<FinancialConsentPreferences> {
  const next: FinancialConsentPreferences = {
    accepted: input.accepted,
    acceptedAt: input.accepted ? new Date().toISOString() : null,
  };

  setSnapshot({
    ...next,
    hydrated: true,
  });

  try {
    await AsyncStorage.setItem(FINANCIAL_CONSENT_KEY, JSON.stringify(next));
  } catch {
    // Keep in-memory consent even if persistence fails.
  }

  return next;
}

export function useFinancialConsent() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void hydrateFinancialConsent();
  }, []);

  const persist = useCallback(async (input: { accepted: boolean }) => {
    return saveFinancialConsent(input);
  }, []);

  return {
    accepted: current.accepted,
    acceptedAt: current.acceptedAt,
    hydrated: current.hydrated,
    saveFinancialConsent: persist,
  };
}
