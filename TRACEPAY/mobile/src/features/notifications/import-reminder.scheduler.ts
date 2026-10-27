import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import {
  loadImportReminderPreference,
  type ReminderFrequency,
} from "./import-reminder.preferences";

const LAST_IMPORT_KEY = "tracepay.importReminder.lastImportAt.v1";
const NOTIFICATION_ID = "tracepay-import-reminder";
const DAY_MS = 24 * 60 * 60 * 1000;

const FREQUENCY_DAYS: Record<ReminderFrequency, number> = {
  "7 days": 7,
  "2 weeks": 14,
  "1 month": 30,
};

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Makes the scheduled reminder match the saved preference: one reminder,
 * counted from the last statement import. Best effort, never throws.
 */
export async function syncImportReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);

    const preference = await loadImportReminderPreference();
    if (!preference.enabled) return;

    const lastImport = Number(await AsyncStorage.getItem(LAST_IMPORT_KEY));
    if (!Number.isFinite(lastImport) || lastImport <= 0) return;

    const fireAt = lastImport + FREQUENCY_DAYS[preference.frequency] * DAY_MS;
    if (fireAt <= Date.now()) return;
    if (!(await ensurePermission())) return;

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: "Time to import a new statement",
        body: "Add your latest statement so TracePay can keep checking for leaks.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
      },
    });
  } catch (error) {
    console.warn("[TracePay][reminder] sync_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

/** Call after a statement is saved: restarts the reminder countdown. */
export async function noteImportCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_IMPORT_KEY, String(Date.now()));
  } catch {
    return;
  }
  await syncImportReminder();
}
