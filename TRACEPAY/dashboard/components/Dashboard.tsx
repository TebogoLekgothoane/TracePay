"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AccountPanel, Activity, AiUsage, Conversion, Costs, Overview, Registrations, Sales, Statements } from "@/components/Sections";
import { when } from "@/lib/format";
import type { AccountDetail, Metrics } from "@/lib/types";

const SESSION_KEY = "tp-superadmin-session";
const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "registrations", label: "Registrations" },
  { id: "sales", label: "Sales" },
  { id: "statements", label: "Statements" },
  { id: "ai", label: "AI usage" },
  { id: "costs", label: "Costs" },
  { id: "conversion", label: "Conversion" },
  { id: "activity", label: "Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_IDS = new Set<string>(TABS.map((item) => item.id));
const DAY_SET = new Set(RANGES.map((range) => range.days));
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readView(): { tab: TabId; days: number; account: string } {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") ?? "";
  const days = Number(params.get("days"));
  const account = params.get("account") ?? "";
  return {
    tab: TAB_IDS.has(tab) ? (tab as TabId) : "overview",
    days: DAY_SET.has(days) ? days : 30,
    account: ACCOUNT_ID.test(account) ? account : "",
  };
}

function writeView(tab: TabId, days: number, account: string): void {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (days !== 30) params.set("days", String(days));
  if (account) params.set("account", account);
  const query = params.toString();
  const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, "", next);
}

function sessionExpired(token: string): boolean {
  const part = token.split(".")[1];
  if (!part) return false;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

function SectionPanel({
  id,
  data,
  onOpenAccount,
  account,
}: {
  id: TabId;
  data: Metrics;
  onOpenAccount: (id: string) => void;
  account: ReactNode;
}): ReactNode {
  switch (id) {
    case "overview":
      return <Overview d={data} />;
    case "registrations":
      return <Registrations d={data} />;
    case "sales":
      return <Sales d={data} />;
    case "statements":
      return <Statements d={data} />;
    case "ai":
      return <AiUsage d={data} />;
    case "costs":
      return <Costs d={data} />;
    case "conversion":
      return <Conversion d={data} />;
    case "activity":
      return <Activity d={data} onOpenAccount={onOpenAccount} account={account} />;
  }
}

// The session lives in this tab's session storage only, never in a cookie or local storage.
function readSession(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveSession(value: string): void {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the session is then only kept in memory */
  }
}

export function Dashboard() {
  // null until session storage has been read, so the sign-in form does not flash on load.
  const [session, setSession] = useState<string | null>(null);
  const [viewReady, setViewReady] = useState(false);
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<TabId>("overview");
  const [accountId, setAccountId] = useState("");
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [accountError, setAccountError] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [data, setData] = useState<Metrics | null>(null);
  const [banner, setBanner] = useState("");
  const [gateMessage, setGateMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const latestRequest = useRef(0);
  const signInRequest = useRef(0);
  const phoneField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const view = readView();
    setTab(view.tab);
    setDays(view.days);
    setAccountId(view.account);
    setSession(readSession());
    setViewReady(true);
  }, []);

  useEffect(() => {
    if (viewReady) writeView(tab, days, accountId);
  }, [viewReady, tab, days, accountId]);

  const gateOpen = session === "";

  useEffect(() => {
    if (gateOpen) phoneField.current?.focus();
  }, [gateOpen]);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!session) return;
      if (sessionExpired(session)) {
        saveSession("");
        setSession("");
        setData(null);
        setGateMessage("Sign in again.");
        return;
      }
      const requestId = ++latestRequest.current;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 45_000);
      setLoading(true);
      try {
        const response = await fetch(`/api/metrics?days=${days}${refresh ? "&refresh=true" : ""}`, {
          headers: { Authorization: `Bearer ${session}` },
          cache: "no-store",
          signal: controller.signal,
        });
        window.clearTimeout(timer);
        if (requestId !== latestRequest.current) return;
        if (response.status === 401) {
          saveSession("");
          setSession("");
          setData(null);
          setGateMessage("Sign in again.");
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
        window.clearTimeout(timer);
        if (requestId === latestRequest.current) {
          setBanner("Cannot reach the dashboard server. Check your connection, then refresh.");
        }
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [session, days],
  );

  useEffect(() => {
    if (viewReady && session) void load(false);
  }, [viewReady, session, days, load]);

  useEffect(() => {
    if (!viewReady || !session || !accountId) {
      setAccount(null);
      setAccountError("");
      setAccountLoading(false);
      return;
    }
    if (sessionExpired(session)) {
      saveSession("");
      setSession("");
      setGateMessage("Sign in again.");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    let active = true;
    setAccountLoading(true);
    setAccountError("");
    void fetch(`/api/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${session}` },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          saveSession("");
          setSession("");
          setData(null);
          setGateMessage("Sign in again.");
          return;
        }
        if (response.status === 404) {
          setAccount(null);
          setAccountError("That account was not found.");
          return;
        }
        if (!response.ok) {
          setAccount(null);
          setAccountError("Could not load that account.");
          return;
        }
        const payload = (await response.json()) as AccountDetail;
        if (!active || typeof payload.id !== "string" || typeof payload.user !== "string") {
          if (active) setAccountError("Could not load that account.");
          return;
        }
        setAccount(payload);
      })
      .catch(() => {
        if (active) setAccountError("Could not load that account.");
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (active) setAccountLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [viewReady, session, accountId]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    const phoneValue = phone.trim();
    if (!phoneValue || !password) {
      setGateMessage("Enter your phone number and password.");
      return;
    }
    const requestId = ++signInRequest.current;
    setSubmitting(true);
    setGateMessage("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneValue, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { accessToken?: unknown; detail?: unknown };
      if (requestId !== signInRequest.current) return;
      if (!response.ok || typeof body.accessToken !== "string" || !body.accessToken) {
        setGateMessage(typeof body.detail === "string" ? body.detail : "Could not sign in.");
        return;
      }
      saveSession(body.accessToken);
      setPassword("");
      setGateMessage("");
      setSession(body.accessToken);
    } catch {
      if (requestId === signInRequest.current) {
        setGateMessage("Cannot reach the dashboard server. Check your connection, then try again.");
      }
    } finally {
      if (requestId === signInRequest.current) setSubmitting(false);
    }
  }

  function openAccount(id: string) {
    setTab("activity");
    setAccountId(id);
  }

  function closeAccount() {
    setAccountId("");
    setAccount(null);
    setAccountError("");
  }

  function signOut() {
    signInRequest.current += 1;
    saveSession("");
    setSession("");
    setAccountId("");
    setAccount(null);
    setPassword("");
    setData(null);
    setSubmitting(false);
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
            <button className="text-btn" type="button" disabled={loading || !session} onClick={() => void load(true)}>
              Refresh
            </button>
            <button className="text-btn muted" type="button" onClick={signOut}>
              Sign out
            </button>
            <span className="stamp">{loading ? "Loading figures…" : data ? `Updated ${when(data.loaded_at ?? data.generated_at)}` : ""}</span>
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
          <div className="shell">
            <aside className="side">
              <nav aria-label="Sections">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={tab === item.id ? "page" : undefined}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </aside>
            <div className="sheet" aria-busy={loading}>
              {loading && !data ? <p className="loading">Loading figures…</p> : null}
              <SectionPanel
                id={tab}
                data={data}
                onOpenAccount={openAccount}
                account={
                  accountId ? (
                    <AccountPanel account={account} loading={accountLoading} error={accountError} onClose={closeAccount} />
                  ) : null
                }
              />
              <footer>
                {data.truncated.length
                  ? `Some tables reached the row cap, so their figures are partial: ${data.truncated.join(", ")}.`
                  : "Figures are read live from the database. Contact details are masked."}
              </footer>
            </div>
          </div>
        )}
      </main>

      <div id="gate" data-open={gateOpen}>
        <form className="panel" id="gate-form" onSubmit={(event) => void signIn(event)}>
          <h2>Sign in</h2>
          <p>Use the superadmin phone number and password. This sign-in stays in this browser tab.</p>
          <div className="field">
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              ref={phoneField}
              type="tel"
              inputMode="tel"
              autoComplete="username"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="actions">
            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
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
