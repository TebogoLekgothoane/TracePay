import * as SecureStore from "expo-secure-store";

import {
  isActionType,
  sanitiseActionNote,
  type ActionType,
} from "../guidance/finding-guidance.model";

const STORAGE_KEY = "tracepay.leak.responses.v1";

export type StoredLeakResponse = {
  action: ActionType;
  note: string | null;
  savedAt: string;
};

const memory: Record<string, StoredLeakResponse> = {};

export async function readLeakResponse(leakId: string): Promise<StoredLeakResponse | null> {
  const all = await readAll();
  return all[leakId] ?? null;
}

export async function saveLeakResponse(
  leakId: string,
  action: ActionType,
  note: string,
): Promise<StoredLeakResponse> {
  const cleaned = sanitiseActionNote(note);
  const saved: StoredLeakResponse = {
    action,
    note: cleaned,
    savedAt: new Date().toISOString(),
  };
  memory[leakId] = saved;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // The response stays available for this session if the device store is unavailable.
  }
  return saved;
}

async function readAll(): Promise<Record<string, StoredLeakResponse>> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return { ...memory };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...memory };
    }
    for (const [key, value] of Object.entries(parsed)) {
      const response = parseResponse(value);
      if (response && key.length > 0 && key.length <= 80) {
        memory[key] = response;
      }
    }
  } catch {
    // Keep whatever was saved in this session.
  }
  return { ...memory };
}

function parseResponse(value: unknown): StoredLeakResponse | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isActionType(row.action) || typeof row.savedAt !== "string") return null;
  const note = row.note == null ? null : row.note;
  if (note !== null && typeof note !== "string") return null;
  return { action: row.action, note, savedAt: row.savedAt };
}
