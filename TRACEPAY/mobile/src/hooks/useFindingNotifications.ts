import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { getSupabase } from "../lib/supabase";
import {
  listFindingNotifications,
  markFindingNotificationRead,
  type FindingNotification,
} from "../features/notifications/finding-notifications";

export function useFindingNotifications() {
  const [notifications, setNotifications] = useState<FindingNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = requestId.current + 1;
    requestId.current = current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await getSupabase().auth.getUser();
      if (authError || !data.user) {
        throw new Error("Sign in to see notifications.");
      }
      const rows = await listFindingNotifications(data.user.id);
      if (requestId.current === current) {
        setNotifications(rows);
      }
    } catch (caught) {
      if (requestId.current === current) {
        setNotifications([]);
        setError(caught instanceof Error ? caught.message : "Notifications could not be loaded.");
      }
    } finally {
      if (requestId.current === current) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        requestId.current += 1;
      };
    }, [load]),
  );

  const markRead = useCallback(async (notification: FindingNotification) => {
    if (notification.deliveryStatus === "read" || markingId) {
      return notification.deliveryStatus === "read";
    }
    setMarkingId(notification.id);
    const readAt = new Date().toISOString();
    try {
      const { data, error: authError } = await getSupabase().auth.getUser();
      if (authError || !data.user) {
        throw new Error("Sign in to update notifications.");
      }
      await markFindingNotificationRead(data.user.id, notification.id, readAt);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, deliveryStatus: "read", readAt }
            : item,
        ),
      );
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The notification could not be marked as read.");
      return false;
    } finally {
      setMarkingId(null);
    }
  }, [markingId]);

  return { notifications, loading, error, markingId, retry: load, markRead };
}
