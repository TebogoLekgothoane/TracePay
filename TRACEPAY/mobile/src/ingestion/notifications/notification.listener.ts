import { Linking } from "react-native";

import { getTracePayIngestionNative, isAndroidIngestionSupported } from "../native/TracePayIngestionNative";

export async function isNotificationListenerEnabled(): Promise<boolean> {
  if (!isAndroidIngestionSupported()) {
    return false;
  }
  return getTracePayIngestionNative().isNotificationListenerEnabled();
}

export async function openNotificationListenerSettings(): Promise<void> {
  if (!isAndroidIngestionSupported()) {
    await Linking.openSettings();
    return;
  }
  await getTracePayIngestionNative().openNotificationListenerSettings();
}

export function startNotificationListener(): () => void {
  return () => undefined;
}
