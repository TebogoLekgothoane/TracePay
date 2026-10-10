export const LEAKS_FALLBACK_HREF = "/(tabs)/leaks" as const;

export type FindingNotification = {
  id: string;
  findingId: string;
  title: string;
  body: string;
  createdAt: string;
  deliveryStatus: "created" | "read";
  readAt: string | null;
};

const LONG_DIGITS = /\d{6,}/;

export function belongsToUser(userId: unknown, actorUserId: string): boolean {
  return typeof userId === "string" && userId === actorUserId;
}

export function readUpdate(readAt: string): {
  delivery_status: "read";
  read_at: string;
} {
  return { delivery_status: "read", read_at: readAt };
}

export function parseFindingNotification(value: unknown): FindingNotification | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const findingId = text(row.finding_id);
  const title = text(row.title);
  const body = text(row.body);
  const createdAt = text(row.created_at);
  const deliveryStatus = row.delivery_status;
  const readAt = row.read_at == null ? null : text(row.read_at);
  if (
    !id ||
    !findingId ||
    !title ||
    !body ||
    !createdAt ||
    LONG_DIGITS.test(title) ||
    LONG_DIGITS.test(body) ||
    (deliveryStatus !== "created" && deliveryStatus !== "read") ||
    (deliveryStatus === "read" && !readAt) ||
    (deliveryStatus === "created" && readAt)
  ) {
    return null;
  }
  return {
    id,
    findingId,
    title: title.slice(0, 120),
    body: body.slice(0, 400),
    createdAt,
    deliveryStatus,
    readAt,
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
