"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { SITE, WAITLIST_INTERESTS } from "@/lib/content";

type Status = "idle" | "sending" | "done" | "error" | "unavailable";

const MESSAGES: Record<string, string> = {
  invalid_email: "That email address doesn’t look right.",
  consent_required: "Please tick the box so we know you’re happy to be emailed.",
  too_many: "Too many attempts. Please try again in a few minutes.",
};

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const toggle = (value: string) =>
    setInterests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, interests, consent, company }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (response.ok && result?.ok) {
        setStatus("done");
        return;
      }
      if (result?.error === "not_configured") {
        setStatus("unavailable");
        return;
      }
      setStatus("error");
      setMessage(MESSAGES[result?.error ?? ""] ?? "Something went wrong. Please try again.");
    } catch {
      setStatus("error");
      setMessage("We couldn’t reach the server. Please check your connection and try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="waitlist-done" role="status">
        <p className="h3">You’re on the list.</p>
        <p className="mt-2 text-muted">We’ll email you when TracePay opens up. No spam, and you can ask us to remove you at any time.</p>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="waitlist-done" role="status">
        <p className="h3">Sign-ups are paused for a moment.</p>
        <p className="mt-2 text-muted">
          Please email us at <a href={`mailto:${SITE.email}?subject=TracePay%20waitlist`}>{SITE.email}</a> and we’ll add you by hand.
        </p>
      </div>
    );
  }

  return (
    <form className="waitlist-form" onSubmit={submit} noValidate>
      <label className="field-label" htmlFor="waitlist-email">Email address</label>
      <input
        id="waitlist-email"
        className="field"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <fieldset className="field-group">
        <legend className="field-label">I’m interested in (optional)</legend>
        {WAITLIST_INTERESTS.map((item) => (
          <label key={item.value} className="check">
            <input
              type="checkbox"
              checked={interests.includes(item.value)}
              onChange={() => toggle(item.value)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>

      {/* Real visitors never see or fill this in. */}
      <div aria-hidden="true" className="hp">
        <label>
          Company
          <input type="text" tabIndex={-1} autoComplete="off" value={company} onChange={(event) => setCompany(event.target.value)} />
        </label>
      </div>

      <label className="check consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>
          I agree that TracePay may email me about its launch. Read the{" "}
          <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link>.
        </span>
      </label>

      {message ? <p className="field-error" role="alert">{message}</p> : null}

      <button type="submit" className="btn btn-solid" disabled={status === "sending" || !consent || !email.trim()}>
        {status === "sending" ? "Joining…" : "Join the waitlist"}
      </button>
    </form>
  );
}
