"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Activity, AiUsage, Conversion, Overview, Registrations, Sales, Statements } from "@/components/Sections";
import { when } from "@/lib/format";
import type { Metrics } from "@/lib/types";

const TOKEN_KEY = "tp-superadmin-token";
const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

// The token lives in this tab's session storage only, never in a cookie or local storage.
function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveToken(value: string): void {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the token is then only kept in memory */
  }
}

export function Dashboard() {
  // null until session storage has been read, so the sign-in form does not flash on load.
  const [token, setToken] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Metrics | null>(null);
  const [banner, setBanner] = useState("");
  const [gateMessage, setGateMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const latestRequest = useRef(0);
  const tokenField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setToken(readToken());
  }, []);

  const gateOpen = token === "";

  useEffect(() => {
    if (gateOpen) tokenField.current?.focus();
  }, [gateOpen]);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!token) return;
      const requestId = ++latestRequest.current;
      setLoading(true);
      try {
        const response = await fetch(`/api/metrics?days=${days}${refresh ? "&refresh=true" : ""}`, {
          headers: { "X-Superadmin-Token": token },
          cache: "no-store",
        });
        if (requestId !== latestRequest.current) return;
        if (response.status === 401) {
          saveToken("");
          setToken("");
          setData(null);
          setGateMessage("That token is not correct.");
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { detail?: string };
          setBanner(
            body.detail ??
              (response.status >= 500
                ? `The backend did not respond (HTTP ${response.status}). Check that the API is running and BACKEND_URL is correct.`
                : `The data could not be loaded (HTTP ${response.status}).`),
          );
          return;
        }
        const payload = (await response.json()) as Metrics;
        if (requestId !== latestRequest.current) return;
        setBanner("");
        setGateMessage("");
        setData(payload);
      } catch {
        if (requestId === latestRequest.current) {
          setBanner("Cannot reach the dashboard server. Check your connection, then refresh.");
        }
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [token, days],
  );

  useEffect(() => {
    if (token) void load(false);
  }, [token, days, load]);

  function signIn(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) {
      setGateMessage("Enter the token.");
      return;
    }
    saveToken(value);
    setDraft("");
    setGateMessage("");
    setToken(value);
  }

  function signOut() {
    saveToken("");
    setToken("");
    setData(null);
    setGateMessage("You have been signed out of this tab.");
  }

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="title">
            <h1>TracePay</h1>
            <span className="env">Superadmin · Beta</span>
          </div>
          <div className="controls">
            <div className="segmented" role="group" aria-label="Date range">
              {RANGES.map((range) => (
                <button
                  key={range.days}
                  type="button"
                  aria-pressed={days === range.days}
                  onClick={() => setDays(range.days)}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button className="text-btn" type="button" disabled={loading || !token} onClick={() => void load(true)}>
              Refresh
            </button>
            <button className="text-btn muted" type="button" onClick={signOut}>
              Sign out
            </button>
            <span className="stamp">{data ? `Updated ${when(data.loaded_at ?? data.generated_at)}` : ""}</span>
          </div>
        </div>
      </header>

      <main className="wrap">
        {banner && <div id="banner">{banner}</div>}
        <div id="alerts" className="notices">
          {data?.alerts.map((alert) => (
            <div key={alert.text} className={`notice ${alert.level}`}>
              {alert.text}
            </div>
          ))}
        </div>

        {data && (
          <>
            <Overview d={data} />
            <Registrations d={data} />
            <Sales d={data} />
            <Statements d={data} />
            <AiUsage d={data} />
            <Conversion d={data} />
            <Activity d={data} />
            <footer>
              {data.truncated.length
                ? `Some tables reached the row cap, so their figures are partial: ${data.truncated.join(", ")}.`
                : "Figures are read live from the database. Contact details are masked."}
            </footer>
          </>
        )}
      </main>

      <div id="gate" data-open={gateOpen}>
        <form className="panel" id="gate-form" onSubmit={signIn}>
          <h2>Sign in</h2>
          <p>Enter the operator token configured on the server. It is kept for this browser tab only.</p>
          <label htmlFor="token">Operator token</label>
          <input
            id="token"
            ref={tokenField}
            type="password"
            autoComplete="off"
            required
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="actions">
            <button className="primary" type="submit">
              Continue
            </button>
          </div>
          <div className="err" role="alert">
            {gateMessage}
          </div>
        </form>
      </div>
    </>
  );
}
