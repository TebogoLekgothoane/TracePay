import assert from "node:assert/strict";

import {
  MAX_APP_IDENTIFIER,
  MAX_BATCH_SIZE,
  MAX_BODY,
  MAX_CLIENT_ID,
  MAX_INGESTION_JSON_BYTES,
  MAX_METADATA_BYTES,
  MAX_SENDER,
  MAX_TITLE,
} from "./ingestion.limits.js";
import { parseIngestionReadings } from "./ingestion.parser.js";

type UpsertResult = { error: { message: string; code?: string } | null };

function mockClient(result: UpsertResult) {
  return {
    from() {
      return {
        upsert() {
          return Promise.resolve(result);
        },
      };
    },
  };
}

const reading = {
  id: "reading-1",
  user_id: "user-1",
  client_id: "sms:abc",
  source: "sms" as const,
  received_at: "2026-09-28T10:00:00.000Z",
  sender: "FNB",
  app_identifier: null,
  title: null,
  body: "Purchase at WOOLWORTHS R 125.00 debit card payment",
};

async function test(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

await test("JSON limit is derived from documented field caps and exceeds 32kb", async () => {
  const expected =
    MAX_BATCH_SIZE *
      (MAX_CLIENT_ID +
        MAX_BODY +
        MAX_METADATA_BYTES +
        MAX_SENDER +
        MAX_APP_IDENTIFIER +
        MAX_TITLE +
        512) +
    4096;
  assert.equal(MAX_INGESTION_JSON_BYTES, expected);
  assert.ok(MAX_INGESTION_JSON_BYTES > 32 * 1024);
});

await test("parseIngestionReadings succeeds when upsert has no error", async () => {
  await parseIngestionReadings(mockClient({ error: null }) as never, [reading]);
});

await test("parseIngestionReadings throws when parsed_transactions upsert fails", async () => {
  await assert.rejects(
    () =>
      parseIngestionReadings(
        mockClient({ error: { message: "permission denied", code: "42501" } }) as never,
        [reading],
      ),
    /Could not store parsed transactions/,
  );
});

await test("parseIngestionReadings no-ops when nothing is parseable", async () => {
  let upsertCalled = false;
  const client = {
    from() {
      return {
        upsert() {
          upsertCalled = true;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  await parseIngestionReadings(client as never, [
    {
      ...reading,
      body: "hello from a friend",
      sender: "MOM",
    },
  ]);
  assert.equal(upsertCalled, false);
});

console.log("ingestion parser tests passed");
