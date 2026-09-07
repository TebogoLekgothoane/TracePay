import { getTracePayIngestionNative, isAndroidIngestionSupported } from "../native/TracePayIngestionNative";
import type { DeviceNotificationReading } from "./notification.types";

export async function collectNotifications(): Promise<DeviceNotificationReading[]> {
  if (!isAndroidIngestionSupported()) {
    return [];
  }
  return getTracePayIngestionNative().readActiveNotifications();
}
