export type IngestionRecord = {
  id: string;
  source: 'sms' | 'notification';
  receivedAt: string;
};

export async function saveIngestionRecord(record: IngestionRecord): Promise<void> {
  void record;
}
