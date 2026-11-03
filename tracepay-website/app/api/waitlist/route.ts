import { NextResponse } from "next/server";

export const runtime = "nodejs";

const INTERESTS = ["individual", "business", "accountant"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Best-effort only: a serverless instance forgets this, which is fine for blocking a burst.
const recent = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function tooMany(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > MAX_PER_WINDOW;
}

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooMany(ip)) return fail(429, "too_many");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid");
  }
  const data = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  // A hidden field real visitors never fill in. Pretend it worked so bots learn nothing.
  if (typeof data.company === "string" && data.company.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) return fail(400, "invalid_email");
  if (data.consent !== true) return fail(400, "consent_required");

  const interests = Array.isArray(data.interests)
    ? [...new Set(data.interests.filter((value): value is (typeof INTERESTS)[number] =>
        (INTERESTS as readonly unknown[]).includes(value),
      ))]
    : [];

  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return fail(503, "not_configured");

  try {
    const response = await fetch(`${url}/rest/v1/waitlist_signups?on_conflict=email`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // The same address twice is fine: it is quietly kept once.
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({ email, interests, source: "website" }),
      cache: "no-store",
    });
    if (!response.ok) return fail(502, "unavailable");
  } catch {
    return fail(502, "unavailable");
  }
  return NextResponse.json({ ok: true });
}
