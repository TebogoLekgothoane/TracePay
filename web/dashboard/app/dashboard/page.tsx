"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    AlertTriangle,
    BarChart3,
    Flame,
    Gauge,
    LayoutDashboard,
    Shield,
    TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Severity = "low" | "medium" | "high";
type HealthBand = "green" | "yellow" | "red";

type MoneyLeak = {
    id: string;
    detector: string;
    title: string;
    plain_language_reason: string;
    severity: Severity;
    transaction_id?: string | null;
    estimated_monthly_cost?: number | null;
};

type AnalyzeResponse = {
    financial_health_score: number;
    health_band: HealthBand;
    money_leaks: MoneyLeak[];
    summary_plain_language: string;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8001";

async function postJSON<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
    }
    return (await res.json()) as T;
}

export default function DashboardPage() {
    const [data, setData] = useState<AnalyzeResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [frozen, setFrozen] = useState<Record<string, boolean>>({});

    const band = data?.health_band ?? "yellow";

    const aggregates = useMemo(() => {
        if (!data) {
            return {
                totalLeaks: 0,
                monthlyLeakCost: 0,
                byDetector: {} as Record<string, { count: number; cost: number }>,
            };
        }
        const totalLeaks = data.money_leaks.length;
        let monthlyLeakCost = 0;
        const byDetector: Record<string, { count: number; cost: number }> = {};

        for (const leak of data.money_leaks) {
            const cost = leak.estimated_monthly_cost ?? 0;
            monthlyLeakCost += cost;
            if (!byDetector[leak.detector]) {
                byDetector[leak.detector] = { count: 0, cost: 0 };
            }
            byDetector[leak.detector].count += 1;
            byDetector[leak.detector].cost += cost;
        }
        return { totalLeaks, monthlyLeakCost, byDetector };
    }, [data]);

    async function runAnalyze() {
        setLoading(true);
        setError(null);
        try {
            const mock = await fetch("/mtn_momo_mock.json").then((r) => r.json());
            const resp = await postJSON<AnalyzeResponse>(`${BACKEND_URL}/analyze`, mock);
            setData(resp);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }

    async function freezeLeak(leak: MoneyLeak) {
        setFrozen((s) => ({ ...s, [leak.id]: true }));
        try {
            await postJSON(`${BACKEND_URL}/freeze`, {
                leak_id: leak.id,
                transaction_id: leak.transaction_id,
                reason: `Freeze pressed for: ${leak.title}`,
            });
        } catch (e) {
            setFrozen((s) => ({ ...s, [leak.id]: false }));
            setError(e instanceof Error ? e.message : "Freeze failed");
        }
    }

    useEffect(() => {
        void runAnalyze();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const leakTypes = useMemo(() => {
        const entries = Object.entries(aggregates.byDetector);
        if (!entries.length) return [];
        const totalCost = entries.reduce((sum, [, v]) => sum + v.cost, 0) || 1;
        return entries
            .map(([detector, v]) => ({
                detector,
                count: v.count,
                cost: v.cost,
                share: Math.round((v.cost / totalCost) * 100),
            }))
            .sort((a, b) => b.cost - a.cost);
    }, [aggregates.byDetector]);

    return (

        <SidebarProvider defaultOpen={true}>
            <DashboardSidebar />
            <SidebarInset className="flex flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight md:text-2xl">
                            <LayoutDashboard className="h-5 w-5 text-primary" />
                            Dashboard
                        </h1>
                        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                            Live forensic view of your Money Leaks, powered by Money Autopsy.
                        </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void runAnalyze()} disabled={loading}>
                        <Activity className="mr-2 h-4 w-4" />
                        {loading ? "Re-checking..." : "Re-run analysis"}
                    </Button>
                </header>

                {error ? (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-100">
                        {error}
                    </div>
                ) : null}

                {/* Top summary cards */}
                <div className="grid gap-3 md:grid-cols-4">
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Money Health
                            </CardTitle>
                            <Gauge className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-semibold">
                                {data ? `${data.financial_health_score}` : "—"}
                                <span className="text-base text-muted-foreground">/100</span>
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                                <Badge className="bg-secondary/70 text-xs capitalize">
                                    {band === "red" ? "High risk" : band === "yellow" ? "Under pressure" : "Stable"}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">
                                    {data?.health_band ?? "analysing..."}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Money Leaks
                            </CardTitle>
                            <Flame className="h-4 w-4 text-accent" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-semibold">{aggregates.totalLeaks || "0"}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Patterns currently draining your balance.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Monthly leakage
                            </CardTitle>
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-semibold">
                                R{Math.round(aggregates.monthlyLeakCost || 0)}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Estimated amount slipping away every month.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Data source
                            </CardTitle>
                            <BarChart3 className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm font-medium">MTN MoMo sample</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Replace with live TracePay transaction stream for production.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Middle grid */}
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                    {/* Leak breakdown card */}
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Flame className="h-4 w-4 text-accent" />
                                Money Leak breakdown
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Where your money is leaking the most this month.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {leakTypes.length > 0 ? (
                                <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
                                    <div className="flex items-center justify-center">
                                        <Chart
                                            type="donut"
                                            width={280}
                                            height={280}
                                            series={leakTypes.map((lt) => lt.cost)}
                                            options={{
                                                chart: {
                                                    type: "donut",
                                                    background: "transparent",
                                                    toolbar: { show: false },
                                                },
                                                labels: leakTypes.map((lt) => lt.detector),
                                                colors: [
                                                    "hsl(var(--primary))",
                                                    "hsl(var(--accent))",
                                                    "hsl(var(--primary) / 0.7)",
                                                    "hsl(var(--accent) / 0.7)",
                                                    "hsl(var(--primary) / 0.5)",
                                                ],
                                                legend: { show: false },
                                                dataLabels: {
                                                    enabled: true,
                                                    formatter: (val: number) => `${Math.round(val)}%`,
                                                    style: {
                                                        fontSize: "11px",
                                                        fontWeight: 600,
                                                        colors: ["hsl(var(--foreground))"],
                                                    },
                                                },
                                                plotOptions: {
                                                    pie: {
                                                        donut: {
                                                            size: "70%",
                                                            labels: {
                                                                show: true,
                                                                name: {
                                                                    show: true,
                                                                    fontSize: "11px",
                                                                    fontWeight: 600,
                                                                    color: "hsl(var(--muted-foreground))",
                                                                    formatter: () => "Top Leak",
                                                                },
                                                                value: {
                                                                    show: true,
                                                                    fontSize: "16px",
                                                                    fontWeight: 700,
                                                                    color: "hsl(var(--primary))",
                                                                    formatter: () => {
                                                                        return leakTypes[0]?.detector ?? "None";
                                                                    },
                                                                },
                                                                total: {
                                                                    show: true,
                                                                    label: "Total",
                                                                    fontSize: "10px",
                                                                    fontWeight: 600,
                                                                    color: "hsl(var(--muted-foreground))",
                                                                    formatter: () => {
                                                                        const total = leakTypes.reduce((sum, lt) => sum + lt.cost, 0);
                                                                        return `R${Math.round(total)}/mo`;
                                                                    },
                                                                },
                                                            },
                                                        },
                                                    },
                                                },
                                                tooltip: {
                                                    theme: "dark",
                                                    y: {
                                                        formatter: (val: number) => `R${Math.round(val)}/month`,
                                                    },
                                                },
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2 text-xs">
                                        {leakTypes.map((lt) => (
                                            <div
                                                key={lt.detector}
                                                className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2"
                                            >
                                                <div className="space-y-0.5">
                                                    <p className="text-[11px] font-medium uppercase tracking-[0.16em]">
                                                        {lt.detector}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {lt.count} leak(s) • R{Math.round(lt.cost)} / month
                                                    </p>
                                                </div>
                                                <span className="text-xs font-semibold text-primary">{lt.share}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    No Money Leaks detected yet. Connect a data source and re-run analysis.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Activity card */}
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Activity className="h-4 w-4 text-primary" />
                                Activity analysis by day
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Simple view of how intense Money Leaks are across the week.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Chart
                                type="bar"
                                height={200}
                                series={[
                                    {
                                        name: "Money Leaks",
                                        data: [40, 55, 48, 70, 80, 50, 35],
                                    },
                                ]}
                                options={{
                                    chart: {
                                        type: "bar",
                                        background: "transparent",
                                        toolbar: { show: false },
                                        sparkline: { enabled: false },
                                    },
                                    xaxis: {
                                        categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                                        labels: {
                                            style: {
                                                colors: "hsl(var(--muted-foreground))",
                                                fontSize: "11px",
                                            },
                                        },
                                    },
                                    yaxis: {
                                        labels: {
                                            style: {
                                                colors: "hsl(var(--muted-foreground))",
                                                fontSize: "11px",
                                            },
                                            formatter: (val: number) => `${val}`,
                                        },
                                    },
                                    colors: ["hsl(var(--primary))"],
                                    plotOptions: {
                                        bar: {
                                            borderRadius: 4,
                                            columnWidth: "60%",
                                        },
                                    },
                                    dataLabels: {
                                        enabled: false,
                                    },
                                    grid: {
                                        borderColor: "hsl(var(--border) / 0.3)",
                                        strokeDashArray: 3,
                                    },
                                    tooltip: {
                                        theme: "dark",
                                        y: {
                                            formatter: (val: number) => `${val} leaks`,
                                        },
                                    },
                                }}
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Fridays show the strongest Money Leaks in this sample — often airtime top-ups and
                                cash-out fees before the weekend.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Bottom row */}
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                    {/* Timeline-style card */}
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <BarChart3 className="h-4 w-4 text-primary" />
                                Money Leaks over the last 7 days
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Illustrative trend for how leaks might behave during the week.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Chart
                                type="area"
                                height={200}
                                series={[
                                    {
                                        name: "Money Leaks",
                                        data: [50, 40, 42, 28, 32, 20, 26, 18, 24, 16, 18, 16],
                                    },
                                ]}
                                options={{
                                    chart: {
                                        type: "area",
                                        background: "transparent",
                                        toolbar: { show: false },
                                        sparkline: { enabled: false },
                                    },
                                    xaxis: {
                                        categories: ["1 May", "2 May", "3 May", "4 May", "5 May", "6 May", "7 May"],
                                        labels: {
                                            style: {
                                                colors: "hsl(var(--muted-foreground))",
                                                fontSize: "11px",
                                            },
                                        },
                                    },
                                    yaxis: {
                                        labels: {
                                            style: {
                                                colors: "hsl(var(--muted-foreground))",
                                                fontSize: "11px",
                                            },
                                            formatter: (val: number) => `${Math.round(val)}k`,
                                        },
                                    },
                                    colors: ["hsl(var(--primary))"],
                                    fill: {
                                        type: "gradient",
                                        gradient: {
                                            shadeIntensity: 1,
                                            opacityFrom: 0.6,
                                            opacityTo: 0.1,
                                            stops: [0, 100],
                                            colorStops: [
                                                {
                                                    offset: 0,
                                                    color: "hsl(var(--primary))",
                                                    opacity: 0.6,
                                                },
                                                {
                                                    offset: 100,
                                                    color: "hsl(var(--primary))",
                                                    opacity: 0,
                                                },
                                            ],
                                        },
                                    },
                                    stroke: {
                                        curve: "smooth",
                                        width: 2,
                                        colors: ["hsl(var(--primary))"],
                                    },
                                    dataLabels: {
                                        enabled: false,
                                    },
                                    grid: {
                                        borderColor: "hsl(var(--border) / 0.3)",
                                        strokeDashArray: 3,
                                    },
                                    tooltip: {
                                        theme: "dark",
                                        y: {
                                            formatter: (val: number) => `${Math.round(val)}k leaks`,
                                        },
                                    },
                                }}
                            />
                            <div className="grid gap-3 text-[11px] text-muted-foreground md:grid-cols-3">
                                <div>
                                    <p className="font-medium text-foreground">Leak-iest day</p>
                                    <p className="mt-1">Friday evening — airtime and cash-out patterns spike.</p>
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">Quietest day</p>
                                    <p className="mt-1">Monday — good moment to reset and review spending.</p>
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">Tip</p>
                                    <p className="mt-1">
                                        Try moving Friday top-ups to a single planned bundle to limit drip-drip leaks.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Leaks list */}
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Shield className="h-4 w-4 text-primary" />
                                Money Leaks — Freeze Centre
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Freeze a leak to simulate revoking consent or blocking that pattern.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {data?.money_leaks.length ? (
                                data.money_leaks.map((leak) => {
                                    const sevColor =
                                        leak.severity === "high"
                                            ? "bg-red-500/20 text-red-100"
                                            : leak.severity === "medium"
                                                ? "bg-yellow-500/20 text-yellow-100"
                                                : "bg-emerald-500/20 text-emerald-100";
                                    const isFrozen = frozen[leak.id] === true;
                                    return (
                                        <div
                                            key={leak.id}
                                            className="flex items-start justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-3"
                                        >
                                            <div className="space-y-1 text-xs">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-sm font-medium">{leak.title}</p>
                                                    <span
                                                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sevColor}`}
                                                    >
                                                        {leak.severity.toUpperCase()}
                                                    </span>
                                                    {typeof leak.estimated_monthly_cost === "number" && (
                                                        <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                                            ~R{Math.round(leak.estimated_monthly_cost)}/month
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground line-clamp-2">
                                                    {leak.plain_language_reason}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground/80">
                                                    Detector: <span className="font-mono">{leak.detector}</span>
                                                    {leak.transaction_id ? (
                                                        <>
                                                            {" "}
                                                            • Tx: <span className="font-mono">{leak.transaction_id}</span>
                                                        </>
                                                    ) : null}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={isFrozen ? "outline" : "default"}
                                                disabled={isFrozen}
                                                className="mt-1 h-8 px-3 text-xs"
                                                onClick={() => void freezeLeak(leak)}
                                            >
                                                {isFrozen ? "Frozen" : "Freeze"}
                                            </Button>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    No leaks to show yet — once analysis finds patterns, they will appear here with a
                                    Freeze button.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}

