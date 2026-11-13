/**
 * Real PostgreSQL (PGlite, WASM) with Supabase-style auth stubs.
 *
 * Every repository migration is applied in order, so the tests exercise the
 * actual constraints, triggers, RLS policies and functions rather than mocks.
 * Only the Supabase platform pieces that do not exist in plain Postgres are
 * stubbed: roles, auth.uid()/auth.role(), auth.users and the storage tables.
 *
 * Limitation: PGlite is single-connection, so "concurrent" imports are
 * serialised; this proves idempotence and constraint behaviour but not true
 * multi-connection lock contention.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(here, "../../../supabase/migrations");

const PLATFORM_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE SCHEMA storage;
  GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    phone text,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT string_to_array(name, '/') $$;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
`;

/** Objects production already had before the first repo migration. */
const PRE_EXISTING = `
  CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
  CREATE FUNCTION public.handle_new_auth_user() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RETURN NEW; END; $$;
`;

/**
 * Production has a transactions_source_identity_check that no repository
 * migration declares; it rejects the 'pdf'/'csv' source values. Modelled here
 * (before the consolidation migrations) so a regression to those values fails.
 */
const PRODUCTION_ONLY_CONSTRAINTS = `
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_source_identity_check
    CHECK (source IN ('statement', 'manual', 'open_banking'));
`;

/**
 * Columns production has but no repo migration declares (the app writes them).
 * Applied before the first migration that reads them. The new consolidation
 * migration re-declares each with ADD COLUMN IF NOT EXISTS.
 */
const DRIFT_BEFORE: Record<string, string> = {
  "202610250001_multi_statement_consolidation.sql": PRODUCTION_ONLY_CONSTRAINTS,
  "202610130001_one_statement_per_bank.sql": `
    ALTER TABLE public.statement_imports
      ADD COLUMN extracted_bank text,
      ADD COLUMN extracted_last4 text,
      ADD COLUMN statement_start_date date,
      ADD COLUMN statement_end_date date,
      ADD COLUMN opening_balance numeric(14, 2),
      ADD COLUMN closing_balance numeric(14, 2);
    ALTER TABLE public.transactions
      ADD COLUMN merchant_name text,
      ADD COLUMN reference text,
      ADD COLUMN extraction_method text;
  `,
};

export type Db = PGlite;

/**
 * accounts/profiles/categories predate the first repo migration in production
 * (a later migration re-declares them idempotently), so it is applied first.
 */
const BASELINE = "202609280002_profiles_phone_and_core_schema.sql";

export function migrationFiles(): string[] {
  const rest = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql") && name !== BASELINE)
    .sort();
  return [BASELINE, ...rest];
}

function loadMigration(name: string): string {
  let sql = readFileSync(path.join(MIGRATIONS, name), "utf8");
  // pgcrypto is only needed for gen_random_uuid(), which is core since PG13.
  sql = sql.replace(/create extension if not exists pgcrypto;?/gi, "");
  return sql;
}

export async function createDatabase(upTo?: string): Promise<Db> {
  const db = new PGlite();
  await db.exec(PLATFORM_STUBS);
  await db.exec(PRE_EXISTING);
  for (const name of migrationFiles()) {
    if (upTo && name !== BASELINE && name > upTo) break;
    try {
      if (DRIFT_BEFORE[name]) await db.exec(DRIFT_BEFORE[name]);
      await db.exec(loadMigration(name));
    } catch (error) {
      throw new Error(`migration ${name} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Run the rest of the body as this user (RLS applies). */
export async function asUser(db: Db, userId: string): Promise<void> {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SELECT set_config('request.jwt.claim.role', 'authenticated', false);`);
}

export async function asAdmin(db: Db): Promise<void> {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`);
}

let counter = 0;
export function uuid(): string {
  counter += 1;
  const hex = counter.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

export async function createUser(db: Db): Promise<string> {
  await asAdmin(db);
  const id = uuid();
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `${id}@example.test`]);
  await db.query(
    "INSERT INTO public.profiles (id, full_name) VALUES ($1, 'Test') ON CONFLICT (id) DO NOTHING",
    [id],
  );
  return id;
}

export async function createAccount(
  db: Db,
  userId: string,
  institution: string,
  last4: string,
  accountType = "cheque",
): Promise<string> {
  await asAdmin(db);
  const id = uuid();
  await db.query(
    `INSERT INTO public.accounts (id, user_id, name, institution, account_type, last_four_digits, connection_source)
     VALUES ($1, $2, $3, $4, $5::public.account_type, $6, 'statement_import')`,
    [id, userId, `${institution} ${last4}`, institution, accountType, last4],
  );
  return id;
}

export type StatementInput = {
  accountId: string;
  fileName?: string;
  contentHash?: string;
  start?: string | null;
  end?: string | null;
};

/** Creates an `uploaded` statement owned by the user (what the app does before extraction). */
export async function createStatement(db: Db, userId: string, input: StatementInput): Promise<string> {
  await asAdmin(db);
  const id = uuid();
  const bank = (
    await db.query<{ bank_key: string }>("SELECT bank_key FROM public.accounts WHERE id = $1", [
      input.accountId,
    ])
  ).rows[0]?.bank_key;
  await db.query(
    `INSERT INTO public.statement_imports
       (id, user_id, account_id, file_path, file_name, file_size, content_hash, format, status, bank_key)
     VALUES ($1, $2, $3, $4, $5, 1000, $6, 'pdf', 'uploaded', $7)`,
    [
      id,
      userId,
      input.accountId,
      `statements/${userId}/${id}.pdf`,
      input.fileName ?? "statement.pdf",
      input.contentHash ?? `hash-${id}`,
      bank,
    ],
  );
  return id;
}

export type RowInput = {
  date: string;
  description: string;
  amount: number;
  type?: "debit" | "credit";
  balance?: number | null;
  reference?: string | null;
  transaction_class?: string;
  category_rule?: string;
  merchant_name?: string;
  date_text?: string;
  date_confidence?: string;
  value_date?: string;
};

export function rowsOf(rows: RowInput[]): string {
  return JSON.stringify(
    rows.map((row, index) => ({
      currency: "ZAR",
      source_row: index + 1,
      extraction_method: "table",
      type: row.type ?? (row.amount < 0 ? "debit" : "credit"),
      ...row,
      amount: row.amount,
    })),
  );
}

export async function importRows(
  db: Db,
  userId: string,
  statementId: string,
  rows: RowInput[],
  statement: Record<string, unknown> = {},
  replace = false,
): Promise<Record<string, number>> {
  await asUser(db, userId);
  const result = await db.query<{ r: Record<string, number> }>(
    "SELECT public.import_statement_transactions($1::uuid, $2::jsonb, $3::jsonb, $4) AS r",
    [statementId, rowsOf(rows), JSON.stringify(statement), replace],
  );
  return result.rows[0].r;
}

export async function scalar<T = number>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  return Object.values(result.rows[0])[0] as T;
}
