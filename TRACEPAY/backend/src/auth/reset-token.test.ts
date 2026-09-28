import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { config } from "../config.js";
import { AuthHttpError } from "./auth.types.js";
import {
  clearUsedResetTokensForTests,
  consumeResetToken,
  createResetToken,
  RESET_TOKEN_TTL_MS,
} from "./reset-token.js";

const SECRET = "tracepay-reset-token-secret-for-tests-32b";
const PHONE = "+27821234567";
const USER_ID = "11111111-2222-3333-4444-555555555555";

function withSecret(run: () => void): void {
  const previous = config.authResetTokenSecret;
  (config as { authResetTokenSecret: string }).authResetTokenSecret = SECRET;
  try {
    clearUsedResetTokensForTests();
    run();
  } finally {
    (config as { authResetTokenSecret: string }).authResetTokenSecret = previous;
    clearUsedResetTokensForTests();
  }
}

function test(name: string, run: () => void): void {
  try {
    withSecret(run);
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test("createResetToken does not use the service-role key", () => {
  const token = createResetToken(USER_ID, PHONE, 1_000_000);
  const parts = token.split(".");
  assert.equal(parts.length, 5);
  const [userId, phone, expiresAt, jti, signature] = parts;
  const payload = `${userId}.${phone}.${expiresAt}.${jti}`;
  const withResetSecret = createHmac("sha256", SECRET).update(payload).digest("base64url");
  const withServiceRole = createHmac("sha256", config.supabaseServiceRoleKey || "service-role")
    .update(payload)
    .digest("base64url");
  assert.equal(signature, withResetSecret);
  assert.notEqual(signature, withServiceRole);
});

test("consumeResetToken accepts a fresh token once", () => {
  const token = createResetToken(USER_ID, PHONE, 1_000_000);
  assert.equal(consumeResetToken(token, PHONE, 1_000_000), USER_ID);
  assert.throws(() => consumeResetToken(token, PHONE, 1_000_001), AuthHttpError);
});

test("consumeResetToken rejects expired tokens", () => {
  const issuedAt = 1_000_000;
  const token = createResetToken(USER_ID, PHONE, issuedAt);
  assert.throws(
    () => consumeResetToken(token, PHONE, issuedAt + RESET_TOKEN_TTL_MS + 1),
    AuthHttpError,
  );
});

test("missing AUTH_RESET_TOKEN_SECRET fails closed", () => {
  (config as { authResetTokenSecret: string }).authResetTokenSecret = "";
  clearUsedResetTokensForTests();
  assert.throws(() => createResetToken(USER_ID, PHONE), AuthHttpError);
});

console.log("reset-token tests passed");
