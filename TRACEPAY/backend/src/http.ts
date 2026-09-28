import type { Request, Response } from "express";

import { AuthHttpError } from "./auth/auth.types.js";

const buckets = new Map<string, number[]>();
const MAX_KEYS = 20_000;

export function allowRequest(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const windowStart = now - windowMs;
  const stamps = (buckets.get(key) ?? []).filter((stamp) => stamp > windowStart);
  if (stamps.length >= max) {
    buckets.set(key, stamps);
    return false;
  }
  stamps.push(now);
  buckets.set(key, stamps);
  if (buckets.size > MAX_KEYS) {
    for (const [entry, times] of buckets) {
      if (times.length === 0 || (times[times.length - 1] ?? 0) < windowStart) {
        buckets.delete(entry);
      }
    }
  }
  return true;
}

export function clientIp(req: Request): string {
  return req.socket.remoteAddress || "unknown";
}

function phoneKey(req: Request): string {
  const phone = typeof req.body?.phone === "string" ? req.body.phone.replace(/\D/g, "").slice(-9) : "";
  return phone.length > 0 ? phone : "none";
}

export function rateLimit(scope: string, max: number, windowMs: number, includePhone = false) {
  return (req: Request, res: Response, next: () => void): void => {
    const key = includePhone ? `${scope}:${clientIp(req)}:${phoneKey(req)}` : `${scope}:${clientIp(req)}`;
    if (!allowRequest(key, max, windowMs)) {
      res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
      return;
    }
    next();
  };
}

export function handleRouteError(error: unknown, res: Response, label: string): void {
  if (error instanceof AuthHttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error(`[${label}]`, error instanceof Error ? error.message : "unknown");
  res.status(500).json({ error: "Something went wrong. Please try again." });
}
