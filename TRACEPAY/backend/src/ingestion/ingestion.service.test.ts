import assert from "node:assert/strict";

import { AuthHttpError } from "../auth/auth.types.js";
import { ingestReadingsHandler } from "./ingestion.controller.js";
import { authenticateUser, ingestReadings } from "./ingestion.service.js";
import type { IngestionBatchBody } from "./ingestion.types.js";

type Write = { table: string; rows: Array<Record<string, unknown>> };

function batch(extra?: Record<string, unknown>): IngestionBatchBody {
  return {
    readings: [
      {
        clientId: "sms:abc",
        source: "sms",
        receivedAt: "2026-09-28T10:00:00.000Z",
        sender: "FNB",
        body: "Purchase at WOOLWORTHS R 125.00 debit card payment",
        ...extra,
      },
    ],
  };
}

function fakeClient(echoUserId?: string) {
  const writes: Write[] = [];
  const client = {
    from(table: string) {
      return {
        upsert(rows: Array<Record<string, unknown>>) {
          writes.push({ table, rows });
          if (table !== "ingestion_readings") {
            return Promise.resolve({ error: null });
          }
          return {
            select() {
              return Promise.resolve({
                error: null,
                data: rows.map((row, index) => ({
                  id: `reading-${index}`,
                  user_id: echoUserId ?? row.user_id,
                  client_id: row.client_id,
                  source: row.source,
                  received_at: row.received_at,
                  sender: row.sender ?? null,
                  app_identifier: row.app_identifier ?? null,
                  title: row.title ?? null,
                  body: row.body,
                })),
              });
            },
          };
        },
      };
    },
  };
  return { client: client as never, writes };
}

function userIds(writes: Write[], table: string): string[] {
  return writes
    .filter((write) => write.table === table)
    .flatMap((write) => write.rows.map((row) => String(row.user_id)));
}

async function test(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

await test("authenticated user can ingest and the stored user_id is theirs", async () => {
  const { client, writes } = fakeClient();
  const result = await ingestReadings("user-a", batch(), client);
  assert.equal(result.accepted, 1);
  assert.deepEqual(result.readings[0], {
    id: "reading-0",
    clientId: "sms:abc",
    source: "sms",
    receivedAt: "2026-09-28T10:00:00.000Z",
  });
  assert.deepEqual(userIds(writes, "ingestion_readings"), ["user-a"]);
  assert.deepEqual(userIds(writes, "parsed_transactions"), ["user-a"]);
});

await test("a matching user_id in the body is ignored and the authenticated id is stored", async () => {
  const { client, writes } = fakeClient();
  await ingestReadings("user-a", batch({ user_id: "user-a", userId: " user-a " }), client);
  assert.deepEqual(userIds(writes, "ingestion_readings"), ["user-a"]);
  assert.deepEqual(userIds(writes, "parsed_transactions"), ["user-a"]);
});

await test("another user's user_id on a reading is rejected before any write", async () => {
  const { client, writes } = fakeClient();
  await assert.rejects(
    () => ingestReadings("user-a", batch({ user_id: "user-b" }), client),
    (error: unknown) => error instanceof AuthHttpError && error.status === 400,
  );
  assert.equal(writes.length, 0);
});

await test("another user's userId on the batch is rejected before any write", async () => {
  const { client, writes } = fakeClient();
  const body = { ...batch(), userId: "user-b" };
  await assert.rejects(
    () => ingestReadings("user-a", body, client),
    (error: unknown) => error instanceof AuthHttpError && error.status === 400,
  );
  assert.equal(writes.length, 0);
});

await test("rows returned for another user are not parsed under that user", async () => {
  const { client, writes } = fakeClient("user-b");
  await assert.rejects(
    () => ingestReadings("user-a", batch(), client),
    (error: unknown) => error instanceof AuthHttpError && error.status === 500,
  );
  assert.deepEqual(userIds(writes, "ingestion_readings"), ["user-a"]);
  assert.deepEqual(userIds(writes, "parsed_transactions"), []);
});

await test("unauthenticated requests are rejected", async () => {
  await assert.rejects(
    () => authenticateUser(undefined),
    (error: unknown) => error instanceof AuthHttpError && error.status === 401,
  );
  await assert.rejects(
    () => authenticateUser("Basic abc"),
    (error: unknown) => error instanceof AuthHttpError && error.status === 401,
  );

  const res = {
    statusCode: 0,
    payload: undefined as { error?: string } | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: { error?: string }) {
      this.payload = payload;
    },
  };
  await ingestReadingsHandler({ header: () => undefined } as never, res as never);
  assert.equal(res.statusCode, 401);
  assert.match(res.payload?.error ?? "", /sign in/i);
});

await test("a blank authenticated user id is rejected before any write", async () => {
  const { client, writes } = fakeClient();
  await assert.rejects(
    () => ingestReadings("  ", batch(), client),
    (error: unknown) => error instanceof AuthHttpError && error.status === 401,
  );
  assert.equal(writes.length, 0);
});

console.log("ingestion service tests passed");
