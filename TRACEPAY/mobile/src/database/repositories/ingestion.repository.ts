import { database } from "../database";

export type IngestionRecord = {
  clientId: string;
  source: "sms" | "notification";
  receivedAt: string;
  sender?: string;
  appIdentifier?: string;
  title?: string;
  body: string;
  metadata?: Record<string, unknown>;
};

type QueuedIngestionRow = {
  client_id: string;
  source: "sms" | "notification";
  received_at: string;
  sender: string | null;
  app_identifier: string | null;
  title: string | null;
  body: string;
  metadata: string;
};

let initialized = false;

function ensureIngestionTable(): void {
  if (initialized) {
    return;
  }

  database.execSync(`
    CREATE TABLE IF NOT EXISTS ingestion_queue (
      client_id TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('sms', 'notification')),
      received_at TEXT NOT NULL,
      sender TEXT,
      app_identifier TEXT,
      title TEXT,
      body TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source, client_id)
    );
  `);
  initialized = true;
}

function toRecord(row: QueuedIngestionRow): IngestionRecord {
  return {
    clientId: row.client_id,
    source: row.source,
    receivedAt: row.received_at,
    sender: row.sender ?? undefined,
    appIdentifier: row.app_identifier ?? undefined,
    title: row.title ?? undefined,
    body: row.body,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

export async function saveIngestionRecord(record: IngestionRecord): Promise<void> {
  ensureIngestionTable();
  await database.runAsync(
    `INSERT OR IGNORE INTO ingestion_queue
      (client_id, source, received_at, sender, app_identifier, title, body, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.clientId,
      record.source,
      record.receivedAt,
      record.sender ?? null,
      record.appIdentifier ?? null,
      record.title ?? null,
      record.body,
      JSON.stringify(record.metadata ?? {}),
    ],
  );
}

export async function saveIngestionRecords(records: readonly IngestionRecord[]): Promise<void> {
  for (const record of records) {
    await saveIngestionRecord(record);
  }
}

export async function getQueuedIngestionRecords(limit = 100): Promise<IngestionRecord[]> {
  ensureIngestionTable();
  const rows = await database.getAllAsync<QueuedIngestionRow>(
    `SELECT client_id, source, received_at, sender, app_identifier, title, body, metadata
     FROM ingestion_queue
     ORDER BY received_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(toRecord);
}

export async function deleteQueuedIngestionRecords(
  records: readonly Pick<IngestionRecord, "clientId" | "source">[],
): Promise<void> {
  ensureIngestionTable();
  for (const record of records) {
    await database.runAsync(
      "DELETE FROM ingestion_queue WHERE source = ? AND client_id = ?",
      [record.source, record.clientId],
    );
  }
}
