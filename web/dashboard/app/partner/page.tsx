"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Gift,
  Percent,
  Sparkles,
  Store,
  TicketCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { TrendBarChart, type TrendPoint } from "@/components/trend-bar-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api";

type Summary = Awaited<ReturnType<typeof apiClient.getPartnerSummary>>;
type Redemptions = Awaited<ReturnType<typeof apiClient.getPartnerRedemptions>>;

function formatRand(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits,
  }).format(value);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Gift;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className={`rounded-xl p-2.5 ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PartnerOverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [redemptions, setRedemptions] = useState<Redemptions>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [summaryData, redemptionData] = await Promise.all([
          apiClient.getPartnerSummary(),
          apiClient.getPartnerRedemptions(),
        ]);
        setSummary(summaryData);
        setRedemptions(redemptionData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load your partner summary.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pointsPerDay: TrendPoint[] = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const redemption of [...redemptions].reverse()) {
      const day = new Date(redemption.redeemed_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      byDay.set(day, (byDay.get(day) ?? 0) + redemption.points_spent);
    }
    return [...byDay.entries()].map(([label, value]) => ({ label, value }));
  }, [redemptions]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Loading partner snapshot...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-6 p-2 md:p-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {!error && (
          <EmptyState
            icon={Store}
            title="No partner account linked"
            description="This login isn't linked to a partner record yet. Contact TracePay to get set up."
          />
        )}
      </div>
    );
  }

  const averagePoints = summary.total_redemptions > 0
    ? summary.total_points_redeemed / summary.total_redemptions
    : 0;
  const averageCommission = summary.total_redemptions > 0
    ? summary.total_commission_owed / summary.total_redemptions
    : 0;
  const recentRedemptions = redemptions.slice(0, 4);
  const latestRedemption = redemptions[0]?.redeemed_at;

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{summary.partner_name}</h1>
            <Badge variant="outline">Partner snapshot</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Offer performance, customer engagement, and commission earned through TracePay.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/partner/redemptions">
            <Gift className="mr-2 h-4 w-4" />
            View redemptions
          </Link>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-500 text-white shadow-lg">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-24 right-48 h-56 w-56 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <CardContent className="relative grid gap-8 p-6 md:grid-cols-[1.35fr_1fr] md:p-8">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white/75">
              <Wallet className="h-4 w-4" />
              Total commission owed
            </div>
            <p className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              {formatRand(summary.total_commission_owed)}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
              Commission accumulated from completed redemptions of your offer on TracePay.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 self-end">
            <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs text-white/65">Per redemption</p>
              <p className="mt-1 text-xl font-semibold">{formatRand(averageCommission)}</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs text-white/65">Latest activity</p>
              <p className="mt-1 text-base font-semibold">
                {latestRedemption
                  ? new Date(latestRedemption).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "No activity"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Total redemptions"
          value={summary.total_redemptions.toLocaleString()}
          detail="Completed offer claims"
          icon={TicketCheck}
          tone="bg-violet-500/10 text-violet-600"
        />
        <MetricCard
          label="Points redeemed"
          value={summary.total_points_redeemed.toLocaleString()}
          detail={`${averagePoints.toFixed(0)} points per redemption`}
          icon={Percent}
          tone="bg-amber-500/10 text-amber-600"
        />
        <MetricCard
          label="Commission per claim"
          value={formatRand(averageCommission)}
          detail={`${formatRand(summary.total_commission_owed)} owed in total`}
          icon={TrendingUp}
          tone="bg-emerald-500/10 text-emerald-600"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Redemption activity</CardTitle>
            <CardDescription>Points redeemed on each active day</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendBarChart
              points={pointsPerDay}
              height={160}
              valueLabel="Points redeemed"
              formatValue={(value) => `${value.toLocaleString()} pts`}
              emptyIcon={Gift}
              emptyTitle="No activity yet"
              emptyDescription="Daily activity appears when customers begin redeeming your offer."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Recent redemptions</CardTitle>
              <CardDescription>Latest completed offer activity</CardDescription>
            </div>
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {recentRedemptions.length === 0 ? (
              <EmptyState
                card={false}
                icon={Gift}
                title="No redemptions yet"
                description="Completed redemptions will appear here."
              />
            ) : (
              <div className="space-y-3">
                {recentRedemptions.map((redemption) => (
                  <div
                    key={redemption.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-lg bg-violet-500/10 p-2 text-violet-600">
                        <Gift className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {redemption.points_spent.toLocaleString()} points
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(redemption.redeemed_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge className="shrink-0">{formatRand(redemption.commission_amount)}</Badge>
                  </div>
                ))}
                <Button variant="ghost" className="w-full" asChild>
                  <Link href="/partner/redemptions">
                    View all redemptions
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-violet-500/20 bg-violet-500/[0.04]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="rounded-xl bg-violet-500/10 p-3 text-violet-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Partner performance readout</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {summary.partner_name} has received {summary.total_redemptions.toLocaleString()} offer
              redemption{summary.total_redemptions === 1 ? "" : "s"}, representing{" "}
              {summary.total_points_redeemed.toLocaleString()} redeemed points and{" "}
              {formatRand(summary.total_commission_owed)} in commission owed.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
