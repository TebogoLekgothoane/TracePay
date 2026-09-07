import { syncIngestionReadings } from "../api/ingestion.api";
import { collectNotifications } from "./notifications/notification.collector";
import { collectSmsReadings } from "./sms/sms.collector";

export type IngestionSyncResult = {
  collected: number;
  uploaded: number;
};

export async function syncDeviceReadings(): Promise<IngestionSyncResult> {
  const [smsReadings, notificationReadings] = await Promise.all([
    collectSmsReadings(),
    collectNotifications(),
  ]);
  const readings = [...smsReadings, ...notificationReadings];

  if (readings.length === 0) {
    return { collected: 0, uploaded: 0 };
  }

  const uploaded = await syncIngestionReadings(readings);
  return { collected: readings.length, uploaded };
}
