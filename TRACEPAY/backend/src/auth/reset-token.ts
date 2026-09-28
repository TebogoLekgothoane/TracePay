import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";
import { AuthHttpError } from "./auth.types.js";

export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

/** jti → expiry; single-use within this process (no Redis). */
const usedResetTokenIds = new Map<string, number>();

function resetTokenSecret(): string {
  const secret = config.authResetTokenSecret;
  if (secret.length < 32) {
    throw new AuthHttpError(
      503,
      "Auth server is missing AUTH_RESET_TOKEN_SECRET. Set a secret of at least 32 characters in TRACEPAY/backend/.env.",
    );
  }
  return secret;
}

function codesEqual(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function pruneUsedResetTokens(now = Date.now()): void {
  for (const [jti, expiresAt] of usedResetTokenIds) {
    if (expiresAt < now) {
      usedResetTokenIds.delete(jti);
    }
  }
}

export function createResetToken(userId: string, phone: string, now = Date.now()): string {
  const secret = resetTokenSecret();
  const expiresAt = now + RESET_TOKEN_TTL_MS;
  const jti = randomBytes(16).toString("hex");
  const payload = `${userId}.${phone}.${expiresAt}.${jti}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function consumeResetToken(token: string, phone: string, now = Date.now()): string {
  const secret = resetTokenSecret();
  const parts = token.split(".");
  if (parts.length !== 5) {
    throw new AuthHttpError(400, "Verification session expired. Please start again.");
  }
  const [userId, tokenPhone, expiresAtRaw, jti, signature] = parts;
  if (!userId || tokenPhone !== phone || !expiresAtRaw || !jti || !signature) {
    throw new AuthHttpError(400, "Verification session expired. Please start again.");
  }
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    throw new AuthHttpError(400, "Verification session expired. Please start again.");
  }
  const expected = createHmac("sha256", secret)
    .update(`${userId}.${phone}.${expiresAtRaw}.${jti}`)
    .digest("base64url");
  if (!codesEqual(expected, signature)) {
    throw new AuthHttpError(400, "Verification session expired. Please start again.");
  }

  pruneUsedResetTokens(now);
  if (usedResetTokenIds.has(jti)) {
    throw new AuthHttpError(400, "Verification session expired. Please start again.");
  }
  usedResetTokenIds.set(jti, expiresAt);
  return userId;
}

/** Test helper — clears single-use state between cases. */
export function clearUsedResetTokensForTests(): void {
  usedResetTokenIds.clear();
}
