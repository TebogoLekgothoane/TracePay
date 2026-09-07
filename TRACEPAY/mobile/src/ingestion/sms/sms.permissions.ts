import { getTracePayIngestionNative, isAndroidIngestionSupported } from "../native/TracePayIngestionNative";

export async function hasSmsPermission(): Promise<boolean> {
  if (!isAndroidIngestionSupported()) {
    return false;
  }
  return getTracePayIngestionNative().hasSmsPermission();
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!isAndroidIngestionSupported()) {
    return false;
  }
  return getTracePayIngestionNative().requestSmsPermission();
}

