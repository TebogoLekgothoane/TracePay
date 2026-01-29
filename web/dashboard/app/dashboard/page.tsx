"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    AlertTriangle,
    BarChart3,
    Brain,
    Database,
    Flame,
    Gauge,
    LayoutDashboard,
    Shield,
    TrendingUp,
    Users,
    MapPin,
    Target
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
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

type OverviewStats = {
    total_users: number;
    active_users: number;
    total_linked_accounts: number;
    total_transactions: number;
    total_analyses: number;
    average_health_score: number;
    total_frozen_items: number;
    total_capital_protected: number;
    active_consents: number;
    ml_anomalies_detected: number;
};

type MLFindings = {
    top_leak_categories: Array<{ category: string, count: number, growth: string }>;
    anomaly_distribution: { high_risk: number, medium_risk: number, low_risk: number };
    predicted_savings_next_month: number;
};

type IngestionStats = {
    total_linked_accounts: number;
    sources: { open_banking: number, mtn_momo: number, manual: number };
    ingestion_health: string;
    last_sync_all: string;
};

type RegionalInsight = {
    region: string;
    average_health_score: number;
    total_leaks: number;
    total_users: number;
    top_leak_type: string;
};

type TemporalData = {
    date: string;
    average_score: number;
    count: number;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function DashboardPage() {
    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [regional, setRegional] = useState<RegionalInsight[]>([]);
    const [temporal, setTemporal] = useState<TemporalData[]>([]);
    const [mlFindings, setMlFindings] = useState<MLFindings | null>(null);
    const [ingestion, setIngestion] = useState<IngestionStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleGlobalSync() {
        setRefreshing(true);
        try {
            await apiClient.syncAllData();
            await fetchStats();
        } catch (e) {
            console.error("Sync error:", e);
            setError("Global data ingestion failed. Please check the backend connection.");
        } finally {
            setRefreshing(false);
        }
    }

    async function fetchStats() {
        setLoading(true);
        setError(null);
        try {
            const [ov, reg, temp, ml, ing] = await Promise.all([
                fetch(`${BACKEND_URL}/admin/stats/overview`).then(r => r.ok ? r.json() : null),
                fetch(`${BACKEND_URL}/admin/stats/regional`).then(r => r.ok ? r.json() : []),
                fetch(`${BACKEND_URL}/admin/stats/temporal`).then(r => r.ok ? r.json() : { temporal_data: [] }),
                fetch(`${BACKEND_URL}/admin/stats/ml-findings`).then(r => r.ok ? r.json() : null),
                fetch(`${BACKEND_URL}/admin/stats/data-ingestion`).then(r => r.ok ? r.json() : null)
            ]);

            if (ov) setStats(ov);
            if (ml) setMlFindings(ml);
            if (ing) setIngestion(ing);
            // Ensure reg is always an array
            setRegional(Array.isArray(reg) ? reg : []);
            setTemporal(temp?.temporal_data || []);
        } catch (e) {
            console.error("Fetch error:", e);
            setError("Could not connect to the TracePay backend. Make sure it is running on port 8001.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void fetchStats();
        // Stakeholder Portal: Automate global data ingestion on load
        void handleGlobalSync();
    }, []);

    const impactValue = useMemo(() => {
        return stats?.total_capital_protected || 0;
    }, [stats]);

    return (
        <SidebarProvider defaultOpen={true}>
            <DashboardSidebar />
            <SidebarInset className="flex flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight md:text-2xl">
                            <Target className="h-5 w-5 text-primary" />
                            Stakeholder Impact Portal
                        </h1>
                        <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                            Platform-wide forensic view of TracePay's economic impact in the Eastern Cape.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleGlobalSync()}
                        disabled={loading || refreshing}
                    >
                        <Activity className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "Ingesting Data..." : "Refresh Analytics"}
                    </Button>
                </header>

                {error ? (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-100">
                        {error}
                    </div>
                ) : null}

                {/* Platform Overview Cards */}
                <div className="grid gap-3 md:grid-cols-4">
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Community Health
                            </CardTitle>
                            <Gauge className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-semibold">
                                {stats ? Math.round(stats.average_health_score) : "—"}
                                <span className="text-base text-muted-foreground">/100</span>
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                                <Badge className="bg-primary/20 text-primary border-none text-[10px] uppercase">
                                    Platform Avg
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Capital Protected
                            </CardTitle>
                            <TrendingUp className="h-4 w-4 text-accent" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-semibold text-accent">R{impactValue.toLocaleString()}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Monthly household capital preserved across Eastern Cape.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                ML Anomalies
                            </CardTitle>
                            <Brain className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-semibold">{stats?.ml_anomalies_detected || "0"}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Potential predatory patterns flagged by MLEngine.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Data Integration
                            </CardTitle>
                            <Database className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-semibold">{stats?.active_consents || "0"}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Active Open Banking & MoMo pipelines operational.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Machine Learning & Ingestion Insights */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                                <Brain className="h-4 w-4 text-primary" />
                                MLEngine Forensic Findings
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Platform-wide patterns identified by automated forensic models.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {mlFindings?.top_leak_categories.map((leak) => (
                                    <div key={leak.category} className="flex items-center justify-between border-b border-border/40 pb-2">
                                        <div>
                                            <p className="text-xs font-medium text-foreground">{leak.category}</p>
                                            <p className="text-[10px] text-muted-foreground">{leak.count} cases detected</p>
                                        </div>
                                        <Badge variant="outline" className={leak.growth.startsWith('+') ? "text-red-400 border-red-400/20 bg-red-400/10" : "text-green-400 border-green-400/20 bg-green-400/10"}>
                                            {leak.growth}
                                        </Badge>
                                    </div>
                                ))}
                                <div className="mt-4 rounded-lg bg-primary/5 p-3">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Predicted Impact (Next 30 Days)</p>
                                    <p className="text-xl font-bold text-primary">R{mlFindings?.predicted_savings_next_month.toLocaleString()}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/80">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                                <Database className="h-4 w-4 text-primary" />
                                Data Ingestion Health
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Real-time monitoring of Open Banking and MoMo data pipelines.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div className="flex items-center justify-center py-4">
                                    <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-4 border-primary/20">
                                        <div className="text-center">
                                            <p className="text-2xl font-bold text-primary">{ingestion?.sources.open_banking}</p>
                                            <p className="text-[10px] text-muted-foreground">OB Sources</p>
                                        </div>
                                        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin-slow" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p className="text-sm font-bold">{ingestion?.sources.open_banking}</p>
                                        <p className="text-[10px] text-muted-foreground">Open Banking</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold">{ingestion?.sources.mtn_momo}</p>
                                        <p className="text-[10px] text-muted-foreground">MTN MoMo</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold">{ingestion?.sources.manual}</p>
                                        <p className="text-[10px] text-muted-foreground">Manual/Mock</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2">
                                    <Activity className="h-3 w-3 text-green-400" />
                                    <p className="text-[10px] text-green-400 font-medium">Pipeline Status: {ingestion?.ingestion_health.toUpperCase()}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts Row */}
                <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
                    {/* Regional Performance */}
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                                <MapPin className="h-4 w-4 text-primary" />
                                Regional Hotspots
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Where Money Leaks are most prevalent in the Eastern Cape.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {regional.map((reg) => (
                                    <div key={reg.region} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="font-medium text-foreground">{reg.region}</span>
                                            <span className="text-muted-foreground">{reg.total_leaks} leaks detected</span>
                                        </div>
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/30">
                                            <div
                                                className="h-full bg-primary"
                                                style={{ width: `${(reg.total_leaks / (regional[0]?.total_leaks || 1)) * 100}%` }}
                                            />
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Top Leak: <span className="text-primary font-medium">{reg.top_leak_type}</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Community Health Trend */}
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                                <TrendingUp className="h-4 w-4 text-primary" />
                                Community Financial Health Trend
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Average platform health score over the last 30 days.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Chart
                                type="area"
                                height={280}
                                series={[
                                    {
                                        name: "Avg Health Score",
                                        data: temporal.map(t => Math.round(t.average_score))
                                    }
                                ]}
                                options={{
                                    chart: {
                                        background: "transparent",
                                        toolbar: { show: false },
                                        sparkline: { enabled: false },
                                    },
                                    stroke: { curve: "smooth", width: 3, colors: ["hsl(var(--primary))"] },
                                    fill: {
                                        type: "gradient",
                                        gradient: {
                                            shadeIntensity: 1,
                                            opacityFrom: 0.45,
                                            opacityTo: 0.05,
                                            stops: [20, 100],
                                            colorStops: [
                                                { offset: 0, color: "hsl(var(--primary))", opacity: 0.45 },
                                                { offset: 100, color: "hsl(var(--primary))", opacity: 0.05 },
                                            ]
                                        }
                                    },
                                    xaxis: {
                                        categories: temporal.map(t => new Date(t.date).toLocaleDateString("en-ZA", { day: 'numeric', month: 'short' })),
                                        labels: { style: { colors: "hsl(var(--muted-foreground))", fontSize: "10px" } }
                                    },
                                    yaxis: {
                                        min: 0,
                                        max: 100,
                                        labels: { style: { colors: "hsl(var(--muted-foreground))", fontSize: "10px" } }
                                    },
                                    grid: { borderColor: "hsl(var(--border) / 0.3)", strokeDashArray: 4 },
                                    tooltip: { theme: "dark" }
                                }}
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* Stakeholder Analytics Row */}
                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Forensic Methodology</CardTitle>
                        </CardHeader>
                        <CardContent className="text-[11px] text-muted-foreground leading-relaxed">
                            TracePay's Forensic Engine uses heuristic detectors combined with ML anomaly detection to identify non-consensual or predatory capital outflows (VAS, hidden fees).
                        </CardContent>
                    </Card>
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Regional Economic Stability</CardTitle>
                        </CardHeader>
                        <CardContent className="text-[11px] text-muted-foreground leading-relaxed">
                            Aggregated data from the Eastern Cape shows that systemic leakage reduction directly correlates with increased household resilience and community capital retention.
                        </CardContent>
                    </Card>
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Data Governance (ESG)</CardTitle>
                        </CardHeader>
                        <CardContent className="text-[11px] text-muted-foreground leading-relaxed">
                            The platform operates on a "User-First" consent model via Open Banking AIS protocols, ensuring high standards of data sovereignty and financial transparency.
                        </CardContent>
                    </Card>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
