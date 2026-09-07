export type IngestionSource = "sms" | "notification";

export type IngestionReadingInput = {
  clientId: string;
  source: IngestionSource;
  receivedAt: string;
  sender?: string;
  appIdentifier?: string;
  title?: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type IngestionBatchBody = {
  readings: IngestionReadingInput[];
};

export type IngestionResult = {
  accepted: number;
  readings: Array<{
    id: string;
    clientId: string;
    source: IngestionSource;
    receivedAt: string;
  }>;
};
