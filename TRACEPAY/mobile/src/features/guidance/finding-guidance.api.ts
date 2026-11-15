import { getPdfProcessorBaseUrl } from "../../constants/config";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import {
  parseFindingGuidance,
  type ActionType,
  type FindingGuidance,
} from "./finding-guidance.model";

const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchFindingGuidance(
  findingId: string,
  signal?: AbortSignal,
): Promise<FindingGuidance> {
  return requestGuidance(`/finding-registry/${findingId}/guidance`, { method: "GET" }, signal);
}

export async function recordFindingAction(
  findingId: string,
  actionType: ActionType,
  note: string | null,
  signal?: AbortSignal,
): Promise<FindingGuidance> {
  return requestGuidance(
    `/finding-registry/${findingId}/actions`,
    {
      method: "POST",
      body: JSON.stringify({ action_type: actionType, note }),
    },
    signal,
  );
}

export type CounteractStep = { title: string; detail: string };

export type CounteractPlan = {
  source: "ai" | "rules";
  summary: string;
  potentialSaving: string;
  actions: CounteractStep[];
  prevent: CounteractStep[];
};

function parseSteps(value: unknown): CounteractStep[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const entry = (item ?? {}) as Record<string, unknown>;
        return typeof entry.title === "string" && typeof entry.detail === "string"
          ? [{ title: entry.title, detail: entry.detail }]
          : [];
      })
    : [];
}

/** Plan for a live finding, identified by its fingerprint. */
export function fetchLeakCounteractPlan(
  fingerprint: string,
  signal?: AbortSignal,
): Promise<CounteractPlan> {
  return requestCounteract("/leak-detections/counteract", { fingerprint }, signal);
}

export function fetchCounteractPlan(
  findingId: string,
  signal?: AbortSignal,
): Promise<CounteractPlan> {
  return requestCounteract(`/finding-registry/${findingId}/counteract`, undefined, signal);
}

async function requestCounteract(
  path: string,
  body: Record<string, string> | undefined,
  signal?: AbortSignal,
): Promise<CounteractPlan> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) throw new Error("Finding guidance is not configured.");
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(safeErrorMessage(payload, response.status));
    const row = (payload ?? {}) as Record<string, unknown>;
    const actions = parseSteps(row.actions);
    const prevent = parseSteps(row.prevent);
    if (typeof row.summary !== "string" || (actions.length === 0 && prevent.length === 0)) {
      throw new Error("The plan could not be read. Please try again.");
    }
    return {
      source: row.source === "ai" ? "ai" : "rules",
      summary: row.summary,
      potentialSaving: typeof row.potential_saving === "string" ? row.potential_saving : "",
      actions,
      prevent,
    };
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error("The plan took too long. Please try again.");
    }
    throw error instanceof Error ? error : new Error("The plan could not be loaded.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function requestGuidance(
  path: string,
  init: { method: "GET" | "POST"; body?: string },
  signal?: AbortSignal,
): Promise<FindingGuidance> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new Error("Finding guidance is not configured.");
  }
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body,
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(safeErrorMessage(payload, response.status));
    }
    const guidance = parseFindingGuidance(payload);
    if (!guidance) {
      throw new Error("Finding guidance could not be read. Please try again.");
    }
    return guidance;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error("Finding guidance timed out. Please try again.");
    }
    if (error instanceof Error && error.message) {
      throw error;
    }
    throw new Error("Finding guidance could not be loaded. Please try again.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  return data.session.access_token;
}

function safeErrorMessage(payload: unknown, status: number): string {
  if (status === 404) {
    return "That finding was not found.";
  }
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length <= 160 && !detail.includes("Traceback")) {
      return detail;
    }
  }
  return "Finding guidance could not be loaded. Please try again.";
}
