"use client";

import { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import {
  TrendingUp,
  Search,
  History as HistoryIcon,
  Shield,
  Zap,
  ShieldCheck,
  Activity,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  User,
  Banknote,
} from "lucide-react";
import dynamic from "next/dynamic";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type AnalysisLeak = {
  type: string;
  impact: number;
  name_xhosa?: string;
};

type AnalysisRow = {
  id: string;
  username: string;
  score: number;
  band: string;
  created_at: string;
  transaction_count: number;
  leaks: AnalysisLeak[];
  retail_velocity: number;
  inclusion_delta: number;
  summary: string;
  open_banking_verified: boolean;
};

function normalizeFeedItem(raw: {
  id: string;
  username: string;
  score: number;
  band: string;
  created_at: string;
  transaction_count: number;
  leaks: Array<{ type: string; impact: number; name_xhosa?: string }>;
  retail_velocity: number;
  inclusion_delta: number;
  summary: string;
  open_banking_verified: boolean;
}): AnalysisRow {
  return {
    ...raw,
    leaks: (raw.leaks ?? []).map((l) => ({
      type: l.type,
      impact: l.impact,
      name_xhosa: l.name_xhosa,
    })),
  };
}

export default function AnalysisHistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [followUpId, setFollowUpId] = useState<string | null>(null);

  useEffect(() => {
    void loadForensicFeed();
  }, []);

  async function loadForensicFeed() {
    setError(null);
    try {
      const data = await apiClient.getForensicFeed(50);
      const rows = Array.isArray(data)
        ? data.map((item) =>
            normalizeFeedItem({
              id: item.id,
              username: item.username,
              score: item.score,
              band: item.band,
              created_at: item.created_at,
              transaction_count: item.transaction_count,
              leaks: item.leaks ?? [],
              retail_velocity: item.retail_velocity,
              inclusion_delta: item.inclusion_delta,
              summary: item.summary,
              open_banking_verified: item.open_banking_verified,
            })
          )
        : [];
      setAnalyses(rows);
    } catch (e) {
      console.error("Failed to load forensic feed:", e);
      setAnalyses([]);
      setError("Could not load analysis history from the backend.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPdf(analysis: AnalysisRow) {
    setExportingId(analysis.id);
    setActionMessage(null);
    try {
      const blob = await apiClient.exportAnalysisPdf(analysis.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tracepay-analysis-${analysis.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setActionMessage("PDF report downloaded.");
    } catch (err) {
      console.error("Failed to export PDF:", err);
      setActionMessage("Could not export the PDF report.");
    } finally {
      setExportingId(null);
    }
  }

  async function handleRequestFollowUp(analysis: AnalysisRow) {
    const note = window.prompt("Add a short follow-up note", "");
    if (note === null) return;

    setFollowUpId(analysis.id);
    setActionMessage(null);
    try {
      await apiClient.requestAnalysisFollowUp(analysis.id, note);
      setActionMessage("Follow-up request recorded.");
    } catch (err) {
      console.error("Failed to request follow-up:", err);
      setActionMessage("Could not record the follow-up request.");
    } finally {
      setFollowUpId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8 text-primary" />
          <p className="text-muted-foreground font-medium">Loading analysis history…</p>
        </div>
      </div>
    );
  }

  const avgScore =
    analyses.length > 0
      ? Math.round(analyses.reduce((acc, a) => acc + a.score, 0) / analyses.length)
      : 0;
  const totalLeaks = analyses.reduce((acc, a) => acc + a.leaks.length, 0);
  const totalVelocity = analyses.reduce((acc, a) => acc + a.retail_velocity, 0);

  const chartOptions: ApexOptions = {
    chart: {
      type: "area",
      toolbar: { show: false },
      background: "transparent",
      fontFamily: "inherit",
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 3 },
    xaxis: {
      categories: analyses
        .slice()
        .reverse()
        .map((a) =>
          new Date(a.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
        ),
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: "#64748b", fontSize: "11px" },
      },
    },
    yaxis: {
      min: 0,
      max: 100,
      labels: {
        style: { colors: "#64748b", fontSize: "11px" },
      },
    },
    colors: ["hsl(270, 70%, 55%)"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.5,
        opacityTo: 0.1,
        stops: [0, 90, 100],
      },
    },
    grid: {
      borderColor: "#e2e8f0",
      strokeDashArray: 4,
    },
    tooltip: {
      theme: "dark",
      y: { formatter: (val: number) => `${val} points` },
    },
  };

  const chartSeries = [
    {
      name: "Health score",
      data: analyses
        .slice()
        .reverse()
        .map((a) => a.score),
    },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-emerald-600";
    if (score >= 50) return "text-amber-500";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return "bg-emerald-500/10 border-emerald-500/20";
    if (score >= 50) return "bg-amber-500/10 border-amber-500/20";
    return "bg-red-500/10 border-red-500/20";
  };

  const getBandIcon = (band: string) => {
    if (band === "green") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (band === "yellow") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <HistoryIcon className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Analysis history</h1>
                </div>
                <p className="text-primary-foreground/80 text-sm md:text-base max-w-2xl">
                  Review past money health sessions and trends across the Eastern Cape.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8">
          {error ? (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          ) : null}

          {actionMessage ? (
            <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {actionMessage}
            </div>
          ) : null}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 -mt-12">
            <Card className="bg-card shadow-lg border-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Total cases</p>
                    <p className="text-xl font-bold">{analyses.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg border-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Avg score</p>
                    <p className="text-xl font-bold">{avgScore}/100</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg border-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Leaks found</p>
                    <p className="text-xl font-bold">{totalLeaks}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-lg border-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Banknote className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Retail potential</p>
                    <p className="text-xl font-bold">R{totalVelocity.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-8 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <CardTitle className="text-lg font-semibold">Health score trend</CardTitle>
                  <CardDescription>Aggregate financial health over time</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {analyses.length > 0 ? (
                <Chart options={chartOptions} series={chartSeries} type="area" height={280} />
              ) : (
                <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  No analysis records are available yet.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent analyses</h2>
              <p className="text-sm text-muted-foreground">{analyses.length} records</p>
            </div>

            <div className="space-y-3">
              {analyses.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    No analysis history returned from the backend yet.
                  </CardContent>
                </Card>
              ) : analyses.map((analysis) => (
                <Sheet key={analysis.id}>
                  <SheetTrigger asChild>
                    <Card className="hover:shadow-md cursor-pointer transition-all duration-200 hover:border-primary/30 group">
                      <CardContent className="p-4 md:p-5">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={`h-14 w-14 shrink-0 rounded-xl flex flex-col items-center justify-center font-bold border ${getScoreBg(analysis.score)}`}
                                >
                                  <span className={`text-xl ${getScoreColor(analysis.score)}`}>
                                    {analysis.score}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">pts</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Financial health score</p>
                              </TooltipContent>
                            </Tooltip>

                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-sm md:text-base truncate">
                                  Case #{analysis.id.slice(0, 6).toUpperCase()}
                                </h3>
                                {getBandIcon(analysis.band)}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                <User className="h-3 w-3 shrink-0" />
                                <span className="truncate">{analysis.username}</span>
                                <span className="text-muted-foreground/50">|</span>
                                <span>{new Date(analysis.created_at).toLocaleDateString("en-ZA")}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className="text-[10px] h-5 font-normal bg-secondary/80 text-secondary-foreground border-transparent">
                                  {analysis.transaction_count} transactions
                                </Badge>
                                {analysis.open_banking_verified && (
                                  <Badge className="text-[10px] h-5 font-normal bg-primary/10 text-primary border-primary/20">
                                    <Shield className="mr-1 h-3 w-3" />
                                    Open Banking verified
                                  </Badge>
                                )}
                                {analysis.leaks.length > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] h-5 font-normal text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
                                  >
                                    {analysis.leaks.length} leak{analysis.leaks.length > 1 ? "s" : ""} detected
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="hidden md:flex items-center gap-6 shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground mb-1">Total impact</p>
                              <p className="text-sm font-semibold text-red-500">
                                {analysis.leaks.length > 0
                                  ? `-R${analysis.leaks.reduce((acc, l) => acc + l.impact, 0).toLocaleString()}`
                                  : "R0"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground mb-1">Retail velocity</p>
                              <p className="text-sm font-semibold text-emerald-600">
                                R{analysis.retail_velocity.toLocaleString()}
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </SheetTrigger>

                  <SheetContent side="right" className="sm:max-w-[520px] overflow-y-auto">
                    <SheetHeader className="text-left">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Shield className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <SheetTitle className="text-xl">Analysis report</SheetTitle>
                          <SheetDescription>Case #{analysis.id.slice(0, 6).toUpperCase()}</SheetDescription>
                        </div>
                      </div>
                    </SheetHeader>

                    <div className="mt-6 p-4 rounded-xl bg-secondary/50 border">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">Financial health score</span>
                        <span className={`text-2xl font-bold ${getScoreColor(analysis.score)}`}>
                          {analysis.score}/100
                        </span>
                      </div>
                      <Progress value={analysis.score} className="h-2" />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>Poor</span>
                        <span>Fair</span>
                        <span>Good</span>
                        <span>Excellent</span>
                      </div>
                    </div>

                    <div className="mt-8">
                      <h3 className="text-sm font-semibold mb-4">Analysis timeline</h3>
                      <div className="relative">
                        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

                        <div className="space-y-6">
                          <div className="flex gap-4 relative">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border-4 border-background z-10 shrink-0">
                              <Zap className="h-4 w-4 text-primary" />
                            </div>
                            <div className="pt-1">
                              <p className="text-sm font-semibold">Data ingestion</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Retrieved <strong>{analysis.transaction_count}</strong> transactions for{" "}
                                <strong>{analysis.username}</strong>
                                {analysis.open_banking_verified ? " via verified Open Banking." : "."}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-4 relative">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border-4 border-background z-10 shrink-0">
                              <Search className="h-4 w-4 text-primary" />
                            </div>
                            <div className="pt-1 flex-1 min-w-0">
                              <p className="text-sm font-semibold">Leak detection</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Found <strong>{analysis.leaks.length}</strong> financial leak
                                {analysis.leaks.length !== 1 ? "s" : ""}.
                              </p>
                              {analysis.leaks.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {analysis.leaks.map((leak, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900"
                                    >
                                      <div className="min-w-0">
                                        <span className="text-sm font-medium">{leak.type}</span>
                                        {leak.name_xhosa && (
                                          <p className="text-[10px] text-muted-foreground italic truncate">
                                            {leak.name_xhosa}
                                          </p>
                                        )}
                                      </div>
                                      <span className="text-sm font-bold text-red-600 shrink-0">
                                        -R{leak.impact.toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-4 relative">
                            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center border-4 border-background z-10 shrink-0">
                              <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div className="pt-1">
                              <p className="text-sm font-semibold">Recommendation</p>
                              <p className="text-xs text-muted-foreground mt-1 italic">&quot;{analysis.summary}&quot;</p>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">Retail potential:</span>
                                <span className="text-sm font-bold text-emerald-600">
                                  R{analysis.retail_velocity.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-4 relative">
                            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border-4 border-background z-10 shrink-0">
                              <TrendingUp className="h-4 w-4 text-primary" />
                            </div>
                            <div className="pt-1">
                              <p className="text-sm font-semibold">Inclusion impact</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Platform score: <strong>{analysis.score}</strong> | Traditional score:{" "}
                                <strong>{Math.max(0, analysis.score - analysis.inclusion_delta)}</strong>
                              </p>
                              <Badge className="mt-2 bg-primary/10 text-primary border-0">
                                +{analysis.inclusion_delta} inclusion lift
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 pt-4 border-t flex gap-2 justify-end flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleExportPdf(analysis)}
                        disabled={exportingId === analysis.id}
                      >
                        {exportingId === analysis.id ? "Exporting..." : "Export PDF"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleRequestFollowUp(analysis)}
                        disabled={followUpId === analysis.id}
                      >
                        {followUpId === analysis.id ? "Recording..." : "Request follow-up"}
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              ))}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
