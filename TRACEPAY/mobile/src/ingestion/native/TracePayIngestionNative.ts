import { NativeModules, Platform } from "react-native";

import type { DeviceNotificationReading } from "../notifications/notification.types";
import type { SmsReading } from "../sms/sms.types";

type TracePayIngestionNativeModule = {
  readSmsInbox: (limit: number) => Promise<SmsReading[]>;
  hasSmsPermission: () => Promise<boolean>;
  requestSmsPermission: () => Promise<boolean>;
  isNotificationListenerEnabled: () => Promise<boolean>;
  openNotificationListenerSettings: () => Promise<void>;
  readActiveNotifications: () => Promise<DeviceNotificationReading[]>;
};

const nativeModule = NativeModules.TracePayIngestion as
  | TracePayIngestionNativeModule
  | undefined;

export function isAndroidIngestionSupported(): boolean {
  return Platform.OS === "android" && Boolean(nativeModule);
}

export function getTracePayIngestionNative(): TracePayIngestionNativeModule {
  if (Platform.OS !== "android") {
    throw new Error("Device SMS and notification reading is only available on Android.");
  }
  if (!nativeModule) {
    throw new Error("TracePay Android ingestion native module is not available in this build.");
  }
  return nativeModule;
}
