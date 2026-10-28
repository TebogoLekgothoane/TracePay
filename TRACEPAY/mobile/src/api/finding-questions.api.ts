import { getPdfProcessorBaseUrl } from "../constants/config";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export class FindingQuestionApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FindingQuestionApiError";
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

type QuestionRef = {
  questionKey: string;
  /** Echoed from the question so a materially changed finding can reopen it. */
  signature: string;
};

/** Record what the user told us. This never changes the statement facts. */
export function answerFindingQuestion(
  ref: QuestionRef & { answer: string },
): Promise<void> {
  return post("/finding-questions/answer", {
    question_key: ref.questionKey,
    answer: ref.answer,
    signature: ref.signature,
  });
}

/** Remember a skip so the question is not asked again until the finding changes. */
export function skipFindingQuestion(ref: QuestionRef): Promise<void> {
  return post("/finding-questions/skip", {
    question_key: ref.questionKey,
    signature: ref.signature,
  });
}

async function post(path: string, body: Record<string, string>): Promise<void> {
  const baseUrl = getPdfProcessorBaseUrl();
  if (!baseUrl) {
    throw new FindingQuestionApiError("TracePay analysis is not configured.");
  }
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      throw new FindingQuestionApiError(errorMessage(payload));
    }
  } catch (error) {
    if (error instanceof FindingQuestionApiError) throw error;
    throw new FindingQuestionApiError(
      controller.signal.aborted
        ? "Saving your answer timed out. Please try again."
        : "Could not save your answer. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function accessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new FindingQuestionApiError("Supabase is not configured.");
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new FindingQuestionApiError("Your session has expired. Please sign in again.");
  }
  return data.session.access_token;
}

function errorMessage(payload: unknown): string {
  const detail =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { detail?: unknown }).detail === "string"
      ? (payload as { detail: string }).detail.trim()
      : "";
  return detail && detail.length <= 180 ? detail : "Could not save your answer. Please try again.";
}
