import assert from "node:assert/strict";

import { AuthHttpError } from "./auth.types.js";
import { assertSupabaseConfig, config, jwtRole } from "../config.js";

function jwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.sig`;
}

type MutableConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
};

const mutable = config as unknown as MutableConfig;
const saved = { ...mutable };

function restore(): void {
  Object.assign(mutable, saved);
}

function withFixture(run: () => void): void {
  try {
    mutable.supabaseUrl = "https://example.supabase.co";
    mutable.supabaseAnonKey = jwt("anon");
    mutable.supabaseServiceRoleKey = jwt("service_role");
    run();
  } finally {
    restore();
  }
}

function test(name: string, run: () => void): void {
  try {
    withFixture(run);
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test("jwtRole detects anon and service_role", () => {
  assert.equal(jwtRole(jwt("anon")), "anon");
  assert.equal(jwtRole(jwt("service_role")), "service_role");
  assert.equal(jwtRole("not-a-jwt"), null);
});

test("assertSupabaseConfig accepts distinct publishable and service-role keys", () => {
  assert.doesNotThrow(() => assertSupabaseConfig());
});

test("assertSupabaseConfig rejects service-role in SUPABASE_ANON_KEY", () => {
  mutable.supabaseAnonKey = jwt("service_role");
  assert.throws(() => assertSupabaseConfig(), AuthHttpError);
});

test("assertSupabaseConfig rejects identical anon and service-role values", () => {
  const shared = jwt("service_role");
  mutable.supabaseAnonKey = shared;
  mutable.supabaseServiceRoleKey = shared;
  assert.throws(() => assertSupabaseConfig(), AuthHttpError);
});

test("assertSupabaseConfig rejects anon key used as service-role", () => {
  mutable.supabaseServiceRoleKey = jwt("anon");
  assert.throws(() => assertSupabaseConfig(), AuthHttpError);
});

console.log("supabase-key validation tests passed");
