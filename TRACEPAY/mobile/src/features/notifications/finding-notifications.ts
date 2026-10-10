import { getSupabase } from "../../lib/supabase";
import {
  belongsToUser,
  parseFindingNotification,
  readUpdate,
  type FindingNotification,
} from "./finding-notifications.model";

export {
  LEAKS_FALLBACK_HREF,
  belongsToUser,
  parseFindingNotification,
  readUpdate,
} from "./finding-notifications.model";
export type { FindingNotification } from "./finding-notifications.model";

const COLUMNS = "id,user_id,finding_id,title,body,created_at,delivery_status,read_at";

export async function listFindingNotifications(
  userId: string,
): Promise<FindingNotification[]> {
  const { data, error } = await getSupabase()
    .from("finding_notifications")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error("Notifications could not be loaded.");
  }
  if (!Array.isArray(data)) {
    throw new Error("Notifications could not be loaded.");
  }
  return data.flatMap((row) => {
    const parsed = parseFindingNotification(row);
    if (!parsed || !belongsToUser((row as { user_id?: unknown }).user_id, userId)) {
      return [];
    }
    return [parsed];
  });
}

export async function markFindingNotificationRead(
  userId: string,
  notificationId: string,
  readAt: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("finding_notifications")
    .update(readUpdate(readAt))
    .eq("id", notificationId)
    .eq("user_id", userId)
    .eq("delivery_status", "created");
  if (error) {
    throw new Error("The notification could not be marked as read.");
  }
}
