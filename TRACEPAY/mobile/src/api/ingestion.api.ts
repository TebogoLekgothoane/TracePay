import { getAuthApiBaseUrl } from "../constants/config";
import {
  deleteQueuedIngestionRecords,
  getQueuedIngestionRecords,
  saveIngestionRecords,
  type IngestionRecord,
} from "../database/repositories/ingestion.repository";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

const DEFAULT_TIMEOUT_MS = 15000;

type IngestionResponse = {
  accepted: number;
  readings: Array<{
    id: string;
    clientId: string;
    source: "sms" | "notification";
    receivedAt: string;
  }>;
};

function apiBaseUrl(): string {
  const value = getAuthApiBaseUrl();
  if (!value) {
    throw new Error("Ingestion API is not configured. Set EXPO_PUBLIC_API_URL.");
  }
  return value;
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Sign in again to sync device readings.");
  }

  return data.session.access_token;
}

async function uploadReadings(readings: readonly IngestionRecord[]): Promise<IngestionResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBaseUrl()}/ingestion/readings`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ readings }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<IngestionResponse> & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not sync device readings.");
    }

    return {
      accepted: payload.accepted ?? 0,
      readings: Array.isArray(payload.readings) ? payload.readings : [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function enqueueIngestionReadings(readings: readonly IngestionRecord[]): Promise<void> {
  await saveIngestionRecords(readings);
}

export async function flushIngestionQueue(): Promise<number> {
  const readings = await getQueuedIngestionRecords();
  if (readings.length === 0) {
    return 0;
  }

  const result = await uploadReadings(readings);
  await deleteQueuedIngestionRecords(readings);
  return result.accepted;
}

export async function syncIngestionReadings(readings: readonly IngestionRecord[]): Promise<number> {
  await enqueueIngestionReadings(readings);
  return flushIngestionQueue();
}

