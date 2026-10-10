export const ACTION_TYPES = [
  "reviewed",
  "steps_completed",
  "dismissed",
  "not_applicable",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABELS: Record<ActionType, string> = {
  reviewed: "Reviewed",
  steps_completed: "Steps completed",
  dismissed: "Dismissed",
  not_applicable: "Not applicable",
};

const DETECTION_STATUSES = [
  "open",
  "explained",
  "action_recorded",
  "monitoring",
  "dismissed",
  "not_observed",
] as const;

export type DetectionStatus = (typeof DETECTION_STATUSES)[number];

const LONG_DIGITS = /\d{6,}/;
const NOTE_LIMIT = 280;
const FINDING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FindingActionRecord = {
  id: string;
  actionType: ActionType;
  note: string | null;
  createdAt: string;
};

export type FindingGuidance = {
  findingId: string;
  title: string;
  detectionStatus: DetectionStatus;
  detectionStatusLabel: string;
  userResponse: ActionType | null;
  reason: string;
  evidence: { label: string; value: string }[];
  known: string[];
  uncertain: string[];
  steps: string[];
  actions: FindingActionRecord[];
  outcomeChecks: OutcomeCheck[];
};

export const OUTCOMES = [
  "still_present",
  "no_longer_detected",
  "insufficient_new_history",
  "materially_changed",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  still_present: "Still present",
  no_longer_detected: "Not detected",
  insufficient_new_history: "Not enough new history",
  materially_changed: "Materially changed",
};

export type OutcomeCheck = {
  id: string;
  outcome: Outcome;
  basis: string;
  checkedAt: string;
};

export function isFindingId(value: string): boolean {
  return FINDING_ID.test(value);
}

export function isActionType(value: unknown): value is ActionType {
  return typeof value === "string" && (ACTION_TYPES as readonly string[]).includes(value);
}

export function sanitiseActionNote(note: string): string | null {
  const cleaned = note.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length > NOTE_LIMIT || LONG_DIGITS.test(cleaned)) {
    throw new Error("The note cannot be saved. Remove long numbers and keep it short.");
  }
  return cleaned;
}

export function guidanceHref(findingId: string): string {
  if (!isFindingId(findingId)) {
    return "/(tabs)/leaks";
  }
  return `/settings/notifications/${findingId}`;
}

export function parseFindingGuidance(value: unknown): FindingGuidance | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const findingId = identifier(row.finding_id);
  const title = text(row.title, 120);
  const detectionStatus = row.detection_status;
  const detectionStatusLabel = text(row.detection_status_label, 80);
  const reason = text(row.reason, 500);
  const userResponse = row.user_response == null ? null : row.user_response;
  if (
    !findingId ||
    !isFindingId(findingId) ||
    !title ||
    !detectionStatusLabel ||
    !reason ||
    !isDetectionStatus(detectionStatus) ||
    (userResponse !== null && !isActionType(userResponse))
  ) {
    return null;
  }
  const known = lines(row.known);
  const uncertain = lines(row.uncertain);
  const steps = lines(row.steps);
  if (!known || !uncertain || !steps) {
    return null;
  }
  const actions = parseActions(row.actions);
  const outcomeChecks =
    row.outcome_checks === undefined ? [] : parseOutcomeChecks(row.outcome_checks);
  if (!actions || !outcomeChecks) {
    return null;
  }
  return {
    findingId,
    title,
    detectionStatus,
    detectionStatusLabel,
    userResponse,
    reason,
    evidence: parseEvidence(row.evidence),
    known,
    uncertain,
    steps,
    actions,
    outcomeChecks,
  };
}

function parseEvidence(value: unknown): { label: string; value: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const evidence: { label: string; value: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const label = text(row.label, 120);
    const shown = text(row.value, 120);
    if (!label || !shown) {
      continue;
    }
    evidence.push({ label, value: shown });
  }
  return evidence;
}

function parseOutcomeChecks(value: unknown): OutcomeCheck[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const checks: OutcomeCheck[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const row = item as Record<string, unknown>;
    const id = identifier(row.id);
    const basis = text(row.basis, 400);
    const checkedAt = timestamp(row.checked_at);
    if (!id || !basis || !checkedAt || !isOutcome(row.outcome)) {
      continue;
    }
    checks.push({ id, outcome: row.outcome, basis, checkedAt });
  }
  return checks;
}

function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}

function parseActions(value: unknown): FindingActionRecord[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const actions: FindingActionRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const row = item as Record<string, unknown>;
    const id = identifier(row.id);
    const createdAt = timestamp(row.created_at);
    if (!id || !createdAt || !isActionType(row.action_type)) {
      return null;
    }
    const note = row.note == null ? null : text(row.note, NOTE_LIMIT);
    actions.push({
      id,
      actionType: row.action_type,
      note,
      createdAt,
    });
  }
  return actions;
}

function lines(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const parsed: string[] = [];
  for (const item of value) {
    const line = text(item, 400);
    if (line) {
      parsed.push(line);
    }
  }
  return parsed.length > 0 ? parsed : null;
}

function isDetectionStatus(value: unknown): value is DetectionStatus {
  return (
    typeof value === "string" &&
    (DETECTION_STATUSES as readonly string[]).includes(value)
  );
}

function identifier(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 80 || /\s/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 40 || Number.isNaN(Date.parse(cleaned))) {
    return null;
  }
  return cleaned;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > max || LONG_DIGITS.test(cleaned)) {
    return null;
  }
  return cleaned;
}
