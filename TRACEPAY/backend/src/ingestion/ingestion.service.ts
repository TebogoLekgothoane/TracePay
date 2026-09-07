import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertSupabaseConfig, config } from "../config.js";
import { AuthHttpError } from "../auth/auth.types.js";
import type { IngestionBatchBody, IngestionReadingInput, IngestionResult, IngestionSource } from "./ingestion.types.js";
import { parseIngestionReadings } from "./ingestion.parser.js";

const MAX_BATCH_SIZE = 100;
const MAX_CLIENT_ID = 128;
const MAX_BODY = 4000;
const MAX_SENDER = 128;
const MAX_APP_IDENTIFIER = 256;
const MAX_TITLE = 256;
const MAX_METADATA_BYTES = 8192;
const MAX_FUTURE_MS = 5 * 60 * 1000;

let adminClient: SupabaseClient | null = null;
let userClient: SupabaseClient | null = null;

type ValidReading = {
  client_id: string;
  source: IngestionSource;
  received_at: string;
  sender: string | null;
  app_identifier: string | null;
  title: string | null;
  body: string;
  metadata: Record<string, unknown>;
};

type StoredReading = {
  id: string;
  user_id: string;
  client_id: string;
  source: IngestionSource;
  received_at: string;
  sender: string | null;
  app_identifier: string | null;
  title: string | null;
  body: string;
};

function getAdmin(): SupabaseClient {
  assertSupabaseConfig();
  if (!adminClient) {
    adminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

function getUserClient(): SupabaseClient {
  assertSupabaseConfig();
  if (!userClient) {
    userClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return userClient;
}

function readBearerToken(authorization: string | undefined): string {
  const [scheme, token] = (authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new AuthHttpError(401, "Sign in to sync phone readings.");
  }
  return token;
}

export async function authenticateUser(authorization: string | undefined): Promise<string> {
  const token = readBearerToken(authorization);
  const { data, error } = await getUserClient().auth.getUser(token);

  if (error || !data.user) {
    throw new AuthHttpError(401, "Your session expired. Please sign in again.");
  }

  return data.user.id;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown, maxLength: number, field: string): string | null {
  const text = readString(value);
  if (!text) {
    return null;
  }
  if (text.length > maxLength) {
    throw new AuthHttpError(400, `${field} is too long.`);
  }
  return text;
}

function requireString(value: unknown, maxLength: number, field: string): string {
  const text = readString(value);
  if (!text) {
    throw new AuthHttpError(400, `${field} is required.`);
  }
  if (text.length > maxLength) {
    throw new AuthHttpError(400, `${field} is too long.`);
  }
  return text;
}

function readSource(value: unknown): IngestionSource {
  if (value === "sms" || value === "notification") {
    return value;
  }
  throw new AuthHttpError(400, "Reading source must be sms or notification.");
}

function readReceivedAt(value: unknown): string {
  const raw = requireString(value, 64, "receivedAt");
  const timestamp = Date.parse(raw);

  if (!Number.isFinite(timestamp)) {
    throw new AuthHttpError(400, "receivedAt must be a valid timestamp.");
  }
  if (timestamp > Date.now() + MAX_FUTURE_MS) {
    throw new AuthHttpError(400, "receivedAt cannot be in the future.");
  }

  return new Date(timestamp).toISOString();
}

function readMetadata(value: unknown): Record<string, unknown> {
  const metadata = readObject(value);
  const size = Buffer.byteLength(JSON.stringify(metadata), "utf8");

  if (size > MAX_METADATA_BYTES) {
    throw new AuthHttpError(400, "metadata is too large.");
  }

  return metadata;
}

function validateReading(value: unknown): ValidReading {
  const reading = readObject(value) as Partial<IngestionReadingInput>;
  const source = readSource(reading.source);
  const sender = readOptionalString(reading.sender, MAX_SENDER, "sender");
  const appIdentifier = readOptionalString(reading.appIdentifier, MAX_APP_IDENTIFIER, "appIdentifier");

  if (source === "sms" && !sender) {
    throw new AuthHttpError(400, "sender is required for SMS readings.");
  }
  if (source === "sms" && appIdentifier) {
    throw new AuthHttpError(400, "SMS readings cannot include appIdentifier.");
  }
  if (source === "notification" && !appIdentifier) {
    throw new AuthHttpError(400, "appIdentifier is required for notification readings.");
  }

  return {
    client_id: requireString(reading.clientId, MAX_CLIENT_ID, "clientId"),
    source,
    received_at: readReceivedAt(reading.receivedAt),
    sender,
    app_identifier: appIdentifier,
    title: readOptionalString(reading.title, MAX_TITLE, "title"),
    body: requireString(reading.body, MAX_BODY, "body"),
    metadata: readMetadata(reading.metadata),
  };
}

function validateBatch(body: IngestionBatchBody): ValidReading[] {
  if (!Array.isArray(body.readings)) {
    throw new AuthHttpError(400, "readings must be an array.");
  }
  if (body.readings.length < 1) {
    throw new AuthHttpError(400, "Send at least one reading.");
  }
  if (body.readings.length > MAX_BATCH_SIZE) {
    throw new AuthHttpError(400, `Send no more than ${MAX_BATCH_SIZE} readings at once.`);
  }

  return body.readings.map(validateReading);
}

export async function ingestReadings(userId: string, body: IngestionBatchBody): Promise<IngestionResult> {
  const readings = validateBatch(body).map((reading) => ({
    ...reading,
    user_id: userId,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await getAdmin()
    .from("ingestion_readings")
    .upsert(readings, { onConflict: "user_id,source,client_id" })
    .select("id, user_id, client_id, source, received_at, sender, app_identifier, title, body");

  if (error) {
    throw new AuthHttpError(500, "Could not sync phone readings. Please try again.");
  }

  await parseIngestionReadings(getAdmin(), data as StoredReading[]);

  return {
    accepted: readings.length,
    readings: (data as StoredReading[]).map((reading) => ({
      id: reading.id,
      clientId: reading.client_id,
      source: reading.source,
      receivedAt: reading.received_at,
    })),
  };
}
