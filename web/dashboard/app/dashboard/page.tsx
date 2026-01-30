"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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
    Target,
    Info,
    ArrowRight,
    Zap,
    Globe,
    Lock,
    Store
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
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

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
    mailbox_effect_prevalence: number;
    avg_inclusion_score: number;
    retail_wealth_unlock: number;
    avg_inclusion_delta: number;
    total_retail_velocity: number;
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
                apiClient.getOverviewStats(),
                apiClient.getRegionalStats(),
                apiClient.getTemporalStats(),
                fetch(`${BACKEND_URL}/admin/stats/ml-findings`).then(r => r.ok ? r.json() : null),
                fetch(`${BACKEND_URL}/admin/stats/data-ingestion`).then(r => r.ok ? r.json() : null)
            ]);

            if (ov) setStats(ov);
            if (ml) setMlFindings(ml);
            if (ing) setIngestion(ing);
            setRegional(Array.isArray(reg) ? reg : []);
            setTemporal(temp?.temporal_data || []);
        } catch (e) {
            console.error("Fetch error:", e);
            setError("Live data sync failed. Ensure the TracePay backend is running on port 8001.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void fetchStats();
        // void handleGlobalSync(); // Removed auto-sync on load to prevent hanging
    }, []);

    const impactValue = useMemo(() => {
        return stats?.total_capital_protected || 0;
    }, [stats]);

    return (
        <TooltipProvider>
            {/* --- IMPACT TICKER --- */}
            {/* <div className="w-full bg-primary/10 border-b border-primary/20 py-1.5 overflow-hidden whitespace-nowrap">
                <div className="flex animate-marquee items-center gap-12 text-[10px] font-bold uppercase tracking-widest text-primary">
                    <span className="flex items-center gap-2"><Zap className="h-3 w-3" /> Live: R{(stats?.total_retail_velocity || 0).toLocaleString()} Recovered for EC Retailers this month</span>
                    <span className="flex items-center gap-2"><Globe className="h-3 w-3" /> Forensic Health Index: {stats?.average_health_score}/100</span>
                    <span className="flex items-center gap-2"><Users className="h-3 w-3" /> Lives Protected: {stats?.total_users.toLocaleString()}</span>
                    <span className="flex items-center gap-2"><TrendingUp className="h-3 w-3" /> Average Inclusion Delta: +{stats?.avg_inclusion_delta || 0} pts</span>
                    {/* Duplicate for seamless loop if needed, but marquee usually handles it */}
            {/* <span className="flex items-center gap-2"><Zap className="h-3 w-3" /> Live: R{(stats?.total_retail_velocity || 0).toLocaleString()} Recovered for EC Retailers this month</span>
                </div>
            </div>  */}
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4 pt-4">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight md:text-2xl">
                        <Target className="h-5 w-5 text-primary" />
                        Stakeholder Intelligence Portal
                    </h1>
                    <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                        High-fidelity forensic monitoring and commercial opportunity mapping for the Eastern Cape.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleGlobalSync()}
                        disabled={loading || refreshing}
                        className="bg-background/50 backdrop-blur-sm border-primary/20 text-primary hover:bg-primary/5"
                    >
                        <Activity className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "Updating Intelligence..." : "Sync Global Pipelines"}
                    </Button>
                </div>
            </header>

            {error ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-100 mt-2">
                    {error}
                </div>
            ) : null}

            <div className="space-y-6 mt-6 pb-12">
                {/* --- EXECUTIVE OVERVIEW --- */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Executive Overview</h2>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-xs text-[10px]">High-level indicators of platform growth and overall community forensic health.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                        <Card className="border-border/70 bg-background/80 hover:border-primary/50 transition-colors">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                    Community Health
                                </CardTitle>
                                <Gauge className="h-4 w-4 text-primary opacity-70" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-semibold">
                                    {stats ? Math.round(stats.average_health_score) : "—"}
                                    <span className="text-base text-muted-foreground font-normal">/100</span>
                                </p>
                                <div className="mt-1 flex items-center justify-between">
                                    <Badge className="bg-primary/20 text-primary border-none text-[8px] h-4 uppercase">EC Average</Badge>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/70 bg-background/80 hover:border-accent/50 transition-colors">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                    Capital Protected
                                </CardTitle>
                                <TrendingUp className="h-4 w-4 text-accent opacity-70" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-semibold text-accent">R{impactValue.toLocaleString()}</p>
                                <p className="mt-1 text-[9px] text-muted-foreground">Total monthly leakage stopped by TracePay</p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/70 bg-background/80">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                    Inclusion Delta
                                </CardTitle>
                                <TrendingUp className="h-4 w-4 text-primary opacity-70" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-semibold text-primary">+{stats?.avg_inclusion_delta || 0}</p>
                                <p className="mt-1 text-[9px] text-muted-foreground">Average points added to traditional credit scores</p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/70 bg-background/80">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                    Retail Velocity
                                </CardTitle>
                                <Store className="h-4 w-4 text-primary opacity-70" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-semibold">R{(stats?.total_retail_velocity || 0).toLocaleString()}</p>
                                <p className="mt-1 text-[9px] text-muted-foreground">Capital redirected to Eastern Cape retail</p>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* --- STAKEHOLDER REVENUE CARDS --- */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-primary">Revenue Streams & Commercial ROI</h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="border-primary/20 bg-primary/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold text-primary flex items-center gap-2">
                                    <Store className="h-4 w-4" /> Retailer Loyalty ROI
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                        Retailers in the region have seen an estimated <strong>R{(stats?.total_retail_velocity || 0).toLocaleString()}</strong> in new purchasing power reclaimed from bank fees.
                                    </p>
                                    <Button variant="ghost" className="p-0 h-auto text-[10px] text-primary hover:bg-transparent hover:underline" asChild>
                                        <Link href="/dashboard/regional">View Retail Map <ArrowRight className="h-2 w-2 ml-1" /></Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-accent/20 bg-accent/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold text-accent flex items-center gap-2">
                                    <Brain className="h-4 w-4" /> Data Insight Sales
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                        Aggregated regional datasets for <strong>{stats?.total_analyses || 0}</strong> forensic sessions available for licensing to Banks and Telcos.
                                    </p>
                                    <Button variant="ghost" className="p-0 h-auto text-[10px] text-accent font-bold hover:bg-transparent hover:underline" asChild>
                                        <Link href="/dashboard/ml-reports">Export Insight Pack <ArrowRight className="h-2 w-2 ml-1" /></Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border bg-secondary/10">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold flex items-center gap-2">
                                    <Lock className="h-4 w-4" /> Autopsy API Status
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Endpoint Health</p>
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-[11px] font-bold">99.9% Uptime</span>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-[9px] h-5 bg-background border-border">v2.4 Stable</Badge>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                    {/* MISSION: EASTERN CAPE */}
                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-primary" />
                                    Regional Hotspots
                                </CardTitle>
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-primary" asChild>
                                    <Link href="/dashboard/regional">Geographic Audit <ArrowRight className="h-3 w-3 ml-1" /></Link>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {regional.map((reg) => (
                                    <div key={reg.region} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="font-bold text-foreground uppercase tracking-tight">{reg.region}</span>
                                            <span className="text-muted-foreground">{reg.average_health_score}/100 Index</span>
                                        </div>
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/30">
                                            <div
                                                className={`h-full ${reg.average_health_score > 60 ? 'bg-primary' : 'bg-red-400'}`}
                                                style={{ width: `${reg.average_health_score}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/80">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Brain className="h-4 w-4 text-primary" />
                                Predicted Forensic Trends
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {mlFindings?.top_leak_categories.map((leak) => (
                                    <div key={leak.category} className="flex items-center justify-between border-b border-border/40 pb-2">
                                        <div>
                                            <p className="text-xs font-medium text-foreground">{leak.category}</p>
                                            <p className="text-[10px] text-muted-foreground">{leak.count} active hotspots</p>
                                        </div>
                                        <Badge variant="outline" className={leak.growth.startsWith('+') ? "text-red-400 border-red-400/20 bg-red-400/10 text-[9px]" : "text-green-400 border-green-400/20 bg-green-400/10 text-[9px]"}>
                                            {leak.growth}
                                        </Badge>
                                    </div>
                                ))}
                                <div className="mt-4 p-3 bg-primary/5 rounded-lg flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Next 30D Savings Prediction</span>
                                    <span className="text-sm font-black text-primary">R{mlFindings?.predicted_savings_next_month.toLocaleString()}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <style jsx global>{`
                @keyframes marquee {
                    0% { transform: translateX(100%); }
                    100% { transform: translateX(-100%); }
                }
                .animate-marquee {
                    display: inline-block;
                    animation: marquee 30s linear infinite;
                }
            `}</style>
        </TooltipProvider>
    );
}
