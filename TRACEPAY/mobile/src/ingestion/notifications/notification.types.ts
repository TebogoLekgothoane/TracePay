export type DeviceNotificationReading = {
  clientId: string;
  source: "notification";
  receivedAt: string;
  appIdentifier: string;
  title?: string;
  body: string;
  metadata?: Record<string, unknown>;
};

