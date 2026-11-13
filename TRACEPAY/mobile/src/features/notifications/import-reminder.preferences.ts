import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "tracepay.importReminder.v1";

export const REMINDER_FREQUENCIES = ["7 days", "2 weeks", "1 month"] as const;
export type ReminderFrequency = (typeof REMINDER_FREQUENCIES)[number];

export type ImportReminderPreference = {
  enabled: boolean;
  frequency: ReminderFrequency;
};

const DEFAULT_PREFERENCE: ImportReminderPreference = {
  enabled: true,
  frequency: "7 days",
};

function parsePreference(raw: string | null): ImportReminderPreference {
  if (!raw) return DEFAULT_PREFERENCE;
  try {
    const parsed = JSON.parse(raw) as Partial<ImportReminderPreference>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_PREFERENCE.enabled,
      frequency: REMINDER_FREQUENCIES.includes(parsed.frequency as ReminderFrequency)
        ? (parsed.frequency as ReminderFrequency)
        : DEFAULT_PREFERENCE.frequency,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export async function loadImportReminderPreference(): Promise<ImportReminderPreference> {
  try {
    return parsePreference(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function useImportReminder() {
  const [preference, setPreference] = useState<ImportReminderPreference>(DEFAULT_PREFERENCE);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (active) setPreference(parsePreference(raw));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const latest = useRef(preference);
  latest.current = preference;

  /** Resolves once the change is saved, so callers can act on the stored value. */
  const update = useCallback(async (patch: Partial<ImportReminderPreference>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setPreference(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the in-memory choice for this session.
    }
  }, []);

  return { preference, update };
}
