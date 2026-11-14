import { ChartCanvas } from "@/components/ChartCanvas";
import { Chart, DataTable, Kpi, Panel, Row, SectionHead } from "@/components/ui";
import {
  aiCallsChart,
  aiTokensChart,
  funnelChart,
  interestsChart,
  methodsChart,
  productsChart,
  revenueChart,
  signupsChart,
  statementsChart,
  waitlistChart,
} from "@/lib/charts";
import { capitalise, ms, num, pct, productName, usd, when, zar } from "@/lib/format";
import type { Metrics } from "@/lib/types";

type D = { d: Metrics };

export function Overview({ d }: D) {
  const k = d.kpis;
  const r = d.registrations;
  const s = d.sales;
  return (
    <section className="section">
      <SectionHead title="Overview" note={`Last ${d.range_days} days · ${d.timezone}`} />
      <div className="kpis">
        <Kpi label="Verified users" value={num(k.registered_total)} sub={`${num(k.accounts_total)} accounts created, ${num(k.unverified_total)} never verified`} />
        <Kpi label="New accounts" value={num(k.new_in_range)} sub={`${num(r.new_verified_in_range)} verified, last ${d.range_days} days`} />
        <Kpi label="Active, 7 days" value={num(k.active_7d)} sub={`${num(r.active_30d)} in the last 30 days`} />
        <Kpi label="Statements uploaded" value={num(k.statements_in_range)} sub={`${pct(k.failure_rate * 100)} of finished imports failed`} />
        <Kpi label="Paying users" value={num(k.paying_users)} sub={`${pct(k.conversion_pct)} of verified users`} />
        <Kpi label="Sales" value={num(k.sales_in_range)} sub={`Last ${d.range_days} days`} />
        <Kpi label="Gross sales" value={zar(k.revenue_range_zar)} sub={`${zar(s.revenue_all_zar)} all time`} />
        <Kpi label="Gross sales per user" value={zar(k.arpu_zar)} sub="All time, per verified user" />
        <Kpi label="Monitoring active" value={num(k.monitoring_live)} sub={`${num(s.monitoring_cancelling)} cancelling, ${zar(s.monitoring_value_zar)} annual value`} />
        <Kpi label="Waitlist" value={num(k.waitlist_total)} sub={`${num(d.waitlist.in_range)} joined in range`} />
      </div>
    </section>
  );
}

export function Registrations({ d }: D) {
  const r = d.registrations;
  return (
    <section className="section">
      <SectionHead title="Registrations" note="Accounts created in the selected range" />
      <div className="grid">
        <Panel span={8} title="Sign-ups per day" hint="New accounts">
          <Chart tall>
            <ChartCanvas data={d} build={signupsChart} label="Sign-ups per day" />
          </Chart>
        </Panel>
        <Panel span={4} title="Account health" hint="All accounts, all time">
          <div className="rows">
            <Row label="Accounts created" value={num(r.total)} />
            <Row label="Verified phone" value={num(r.verified)} />
            <Row label="Never verified" value={num(r.unverified)} />
            <Row label="Created today" value={num(r.new_today)} />
            <Row label="Created in last 7 days" value={num(r.new_7d)} />
            <Row label="Signed in once, never again" value={num(r.signed_up_once)} />
            <Row label="Active in last 7 days" value={num(r.active_7d)} />
            <Row label="Active in last 30 days" value={num(r.active_30d)} />
            <Row label="With email" value={num(r.with_email)} />
            <Row label="With phone" value={num(r.with_phone)} />
          </div>
        </Panel>
      </div>
    </section>
  );
}

export function Sales({ d }: D) {
  const s = d.sales;
  return (
    <section className="section">
      <SectionHead
        title="Sales"
        note="Gross, in rand: configured price per purchase, before app-store fees and VAT. Annual renewals are not counted."
      />
      <div className="grid">
        <Panel span={8} title="Gross sales per day" hint="Bars show sales value (ZAR), the line shows the number of sales">
          <Chart tall>
            <ChartCanvas data={d} build={revenueChart} label="Gross sales per day" />
          </Chart>
        </Panel>
        <Panel span={4} title="Revenue by product" hint="All time">
          <Chart>
            <ChartCanvas data={d} build={productsChart} label="Revenue by product" />
          </Chart>
          <div className="rows">
            <Row label="Paying users" value={num(s.paying_users)} />
            <Row label="Refunds" value={`${num(s.refunded_count)} · ${zar(s.refunded_zar)}`} />
            <Row label="Full analysis price" value={zar(s.price_zar.full_analysis)} />
            <Row label="Annual monitoring price" value={zar(s.price_zar.annual_monitoring)} />
            {Object.entries(s.status_counts).map(([status, count]) => (
              <Row key={status} label={`Purchases, ${status}`} value={num(count)} />
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

export function Statements({ d }: D) {
  const st = d.statements;
  return (
    <section className="section">
      <SectionHead title="Statements" note="Statement imports and their outcome" />
      <div className="grid">
        <Panel span={8} title="Uploads per day" hint="Split by outcome">
          <Chart tall>
            <ChartCanvas data={d} build={statementsChart} label="Statement uploads per day" />
          </Chart>
        </Panel>
        <Panel span={4} title="Extraction method" hint="Processed statements in range">
          <Chart>
            <ChartCanvas data={d} build={methodsChart} label="Extraction method" />
          </Chart>
          <div className="rows">
            <Row label="Uploads in range" value={num(st.in_range)} />
            <Row label="Cancelled by the user" value={num(st.cancelled_in_range)} />
            <Row label="Users who have uploaded" value={num(st.users_uploaded)} />
            <Row label="Uploaded, never processed" value={num(st.uploaded_not_processed)} />
            <Row label="Transactions imported in range" value={num(st.transactions_imported_in_range)} />
            <Row label="Transactions stored, all time" value={num(st.transactions_total)} />
          </div>
        </Panel>
      </div>
    </section>
  );
}

export function AiUsage({ d }: D) {
  const { ai } = d;
  const t = ai.total;
  const b = ai.budget;
  const successRate = t.calls ? (100 * t.success) / t.calls : 0;
  const emptyNote = ai.logging_ready ? "No AI calls in this range." : "Not recorded yet.";
  return (
    <section className="section">
      <SectionHead title="AI usage" note="Paid model calls across the app, by feature" />
      {!ai.logging_ready && (
        <div className="notice warning">
          AI usage is not being recorded yet. Apply migration 202611140002_ai_usage_events.sql to the database. Calls are
          logged from that point on; earlier calls cannot be recovered.
        </div>
      )}
      <div className="kpis">
        <Kpi label="AI calls" value={num(t.calls)} sub={`${num(t.items)} items sent`} />
        <Kpi label="Tokens" value={num(t.tokens)} sub={`${num(t.tokens_in)} in, ${num(t.tokens_out)} out`} />
        <Kpi label="Estimated cost" value={usd(t.cost_usd)} sub={t.unpriced_tokens ? `${num(t.unpriced_tokens)} tokens unpriced` : "From list prices"} />
        <Kpi label="Successful calls" value={t.calls ? pct(successRate) : "—"} sub={`${num(t.failed + t.rejected)} failed or rejected`} />
        <Kpi label="Average response" value={ms(t.avg_ms)} sub="Per call" />
        <Kpi label="Daily budget in use" value={num(b.items_used_current_window)} sub={`${num(b.users_with_usage)} users, limit ${num(b.daily_item_limit)} each`} />
      </div>
      <div className="grid" style={{ marginTop: 16 }}>
        <Panel span={8} title="Calls per day" hint="Stacked by feature">
          <Chart tall>
            <ChartCanvas data={d} build={aiCallsChart} label="AI calls per day" />
          </Chart>
        </Panel>
        <Panel span={4} title="Tokens by feature" hint="Selected range">
          <Chart>
            <ChartCanvas data={d} build={aiTokensChart} label="Tokens by feature" />
          </Chart>
        </Panel>
        <Panel span={12} title="Usage by feature" hint={ai.prices_note}>
          <div className="table-wrap">
            <DataTable
              empty={emptyNote}
              columns={[
                { label: "Feature" },
                { label: "Calls", num: true },
                { label: "Items", num: true },
                { label: "Success", num: true },
                { label: "Failed", num: true },
                { label: "Tokens in", num: true },
                { label: "Tokens out", num: true },
                { label: "Est. cost", num: true },
                { label: "Avg time", num: true },
              ]}
              rows={ai.by_feature.map((f) => [
                f.label,
                num(f.calls),
                num(f.items),
                num(f.success),
                num(f.failed + f.rejected),
                num(f.tokens_in),
                num(f.tokens_out),
                usd(f.cost_usd),
                ms(f.avg_ms),
              ])}
            />
          </div>
        </Panel>
        <Panel span={6} title="Usage by model" hint="Provider and model as reported by the provider">
          <div className="table-wrap">
            <DataTable
              empty={emptyNote}
              columns={[
                { label: "Provider" },
                { label: "Model" },
                { label: "Calls", num: true },
                { label: "Tokens", num: true },
                { label: "Est. cost", num: true },
              ]}
              rows={ai.by_model.map((m) => [
                m.provider,
                m.model,
                num(m.calls),
                num(m.tokens),
                m.unpriced_tokens ? "—" : usd(m.cost_usd),
              ])}
            />
          </div>
        </Panel>
        <Panel span={6} title="Heaviest users" hint="Transactions sent to AI in each user's current 24-hour window">
          <div className="table-wrap">
            <DataTable
              empty="No users have used AI in their current window."
              columns={[{ label: "User" }, { label: "Items used", num: true }, { label: "Of daily limit", num: true }]}
              rows={b.top_users.map((u) => [u.user, num(u.used), pct(u.pct_of_limit)])}
            />
          </div>
        </Panel>
      </div>
    </section>
  );
}

export function Conversion({ d }: D) {
  return (
    <section className="section">
      <SectionHead title="Conversion and demand" note="Where users stop, and what they ask for" />
      <div className="grid">
        <Panel span={6} title="Activation funnel" hint="Distinct users reaching each step, all time">
          <Chart tall>
            <ChartCanvas data={d} build={funnelChart} label="Activation funnel" />
          </Chart>
        </Panel>
        <Panel span={6} title="Waitlist" hint="Cumulative sign-ups, with daily additions">
          <Chart tall>
            <ChartCanvas data={d} build={waitlistChart} label="Waitlist growth" />
          </Chart>
        </Panel>
        <Panel span={6} title="Waitlist interests" hint="Self-reported, all time">
          <Chart>
            <ChartCanvas data={d} build={interestsChart} label="Waitlist interests" />
          </Chart>
        </Panel>
        <Panel span={6} title="Statement failures" hint="Most common reasons in the selected range">
          <div className="table-wrap">
            <DataTable
              empty="No failed statements in this range."
              columns={[{ label: "Reason", wrap: true }, { label: "Count", num: true }]}
              rows={d.statements.failure_reasons.map((f) => [f.reason, num(f.count)])}
            />
          </div>
        </Panel>
      </div>
    </section>
  );
}

function statusClass(status: string): string {
  if (status === "succeeded") return "status ok";
  if (status === "failed" || status === "refunded") return "status bad";
  return "status";
}

export function Activity({ d }: D) {
  return (
    <section className="section">
      <SectionHead title="Recent activity" note="Latest 25 of each. Contact details are masked." />
      <div className="grid">
        <Panel span={6} title="Purchases" hint="Every status">
          <div className="table-wrap">
            <DataTable
              empty="No purchases yet."
              columns={[
                { label: "Date" },
                { label: "User" },
                { label: "Product" },
                { label: "Amount", num: true },
                { label: "Status" },
              ]}
              rows={d.sales.recent.map((p) => [
                when(p.when),
                p.user,
                productName(p.product),
                zar(p.amount_zar),
                <span key="s" className={statusClass(p.status)}>
                  {capitalise(p.status)}
                </span>,
              ])}
            />
          </div>
        </Panel>
        <Panel span={6} title="Sign-ups" hint="Newest accounts">
          <div className="table-wrap">
            <DataTable
              empty="No accounts yet."
              columns={[
                { label: "Joined" },
                { label: "User" },
                { label: "Last sign-in" },
                { label: "Statements", num: true },
                { label: "Paying" },
              ]}
              rows={d.recent_signups.map((u) => [
                when(u.when),
                u.user,
                when(u.last_sign_in),
                num(u.statements),
                u.paying ? "Yes" : "No",
              ])}
            />
          </div>
        </Panel>
      </div>
    </section>
  );
}
