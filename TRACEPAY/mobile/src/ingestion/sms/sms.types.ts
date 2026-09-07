export type SmsReading = {
  clientId: string;
  source: "sms";
  receivedAt: string;
  sender: string;
  body: string;
  metadata?: Record<string, unknown>;
};

