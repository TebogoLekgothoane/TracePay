import { getTracePayIngestionNative, isAndroidIngestionSupported } from "../native/TracePayIngestionNative";
import type { SmsReading } from "./sms.types";

const DEFAULT_SMS_LIMIT = 250;

export async function collectSmsReadings(limit = DEFAULT_SMS_LIMIT): Promise<SmsReading[]> {
  if (!isAndroidIngestionSupported()) {
    return [];
  }
  return getTracePayIngestionNative().readSmsInbox(limit);
}
export async function collectSms(): Promise<void> {
  return undefined;
}
