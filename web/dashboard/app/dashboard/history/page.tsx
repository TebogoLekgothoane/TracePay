"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  AlertCircle,
  Search,
  ArrowRight,
  Clock,
  History as HistoryIcon,
  Shield,
  Zap
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
  SheetTrigger
} from "@/components/ui/sheet";
import { apiClient } from "@/lib/api";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function AnalysisHistoryPage() {
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<any>(null);

  useEffect(() => {
    void loadForensicFeed();
  }, []);

  async function loadForensicFeed() {
    try {
      const data = await apiClient.getForensicFeed(50);
      setAnalyses(data);
    } catch (error) {
      console.error("Failed to load forensic feed:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-primary font-medium">Loading Forensic History...</div>;
  }

  const chartOptions: any = {
    chart: { type: "area", toolbar: { show: false }, background: 'transparent' },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2 },
    xaxis: {
      categories: analyses.slice().reverse().map((a) => new Date(a.created_at).toLocaleDateString()),
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: { min: 0, max: 100 },
    colors: ["#a855f7"],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [20, 100, 100, 100]
      }
    },
    grid: { borderColor: "#f1f1f1" }
  };

  const chartSeries = [{
    name: "Platform Health Avg",
    data: analyses.slice().reverse().map((a) => a.score),
  }];

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forensic Case Feed</h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <HistoryIcon className="h-4 w-4" />
            Audit trail of diagnostic sessions across the Eastern Cape
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-8">
            <Search className="mr-2 h-3 w-3" /> Filter Cases
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Historical Trend</CardTitle>
                <CardDescription className="text-xs">Aggregate health fluctuations across the monitored region</CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                AISP-Verified Data
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Chart options={chartOptions} series={chartSeries} type="area" height={250} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground px-1">Recent Autopsies</h2>
          {analyses.map((analysis) => (
            <Sheet key={analysis.id}>
              <SheetTrigger asChild>
                <Card
                  className="border-border/70 hover:border-primary/50 cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
                  onClick={() => setSelectedCase(analysis)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg ${analysis.band === "green" ? "bg-green-500/10 text-green-500" :
                          analysis.band === "yellow" ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"
                          }`}>
                          {analysis.score}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm">Case #{analysis.id.slice(0, 6).toUpperCase()}</h3>
                            <Badge variant="outline" className="text-[9px] h-4 py-0 font-normal">
                              {analysis.username}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(analysis.created_at).toLocaleString()} • {analysis.transaction_count} Transactions
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-8">
                        <div className="hidden md:block text-right">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground">Detected Leaks</p>
                          <p className="text-sm font-semibold">{analysis.leaks.length || "None"}</p>
                        </div>
                        <div className="hidden md:block text-right">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground">Retail Velocity</p>
                          <p className="text-sm font-semibold">R{Math.round(analysis.retail_velocity)}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </SheetTrigger>
              <SheetContent side="right" className="sm:max-w-[500px] bg-background/95 backdrop-blur-lg border-l border-primary/20">
                <SheetHeader>
                  <div className="flex items-center gap-3 mb-2 text-left">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <SheetTitle className="text-xl">Digital Autopsy Report</SheetTitle>
                      <SheetDescription className="text-xs">Case: #{analysis.id.slice(0, 6).toUpperCase()} • Forensic Detail Audit</SheetDescription>
                    </div>
                  </div>
                </SheetHeader>

                <div className="mt-6 relative">
                  <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border/40" />

                  <div className="space-y-8 relative">
                    {/* Step 1: Ingestion */}
                    <div className="flex gap-4">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center border-4 border-background z-10 shadow-sm">
                        <Zap className="h-4 w-4 text-primary" />
                      </div>
                      <div className="pt-1">
                        <p className="text-xs font-bold uppercase tracking-wider">AISP Ingestion</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Connected to Open Banking API. Successfully retrieved <strong>{analysis.transaction_count}</strong> raw bank records for <strong>{analysis.username}</strong>.
                        </p>
                        <Badge variant="outline" className="mt-2 text-[9px] h-4">ID: ob_auth_{analysis.id.slice(0, 8)}</Badge>
                      </div>
                    </div>

                    {/* Step 2: Analysis */}
                    <div className="flex gap-4">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center border-4 border-background z-10 shadow-sm">
                        <Search className="h-4 w-4 text-primary" />
                      </div>
                      <div className="pt-1 text-left">
                        <p className="text-xs font-bold uppercase tracking-wider">Forensic Scan</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Engine ran 12 detectors. Found <strong>{analysis.leaks.length}</strong> active leakage hotspots.
                        </p>
                        <div className="mt-3 space-y-2">
                          {analysis.leaks.map((leak: any, i: number) => (
                            <div key={i} className="flex flex-col p-2 bg-secondary/30 rounded border border-border/40">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold">{leak.type}</span>
                                <span className="text-[11px] font-black text-red-400">-R{Math.round(leak.impact)}</span>
                              </div>
                              {leak.name_xhosa && (
                                <span className="text-[9px] text-muted-foreground italic mt-0.5">{leak.name_xhosa}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Recommendation */}
                    <div className="flex gap-4">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center border-4 border-background z-10 shadow-sm">
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="pt-1">
                        <p className="text-xs font-bold uppercase tracking-wider">Protective Action</p>
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          "{analysis.summary}"
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Retail spend potential unlocked:
                          <span className="text-green-500 font-bold ml-1">R{Math.round(analysis.retail_velocity)}</span>.
                        </p>
                      </div>
                    </div>

                    {/* Step 4: Inclusion Score */}
                    <div className="flex gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border-4 border-background z-10 shadow-sm">
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <div className="pt-1">
                        <p className="text-xs font-bold uppercase tracking-wider">Hybrid Inclusion Score</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Platform Score: <strong>{analysis.score}/100</strong>.
                          Traditional Bank Score equivalent: <strong>{Math.max(0, analysis.score - analysis.inclusion_delta)}</strong>.
                        </p>
                        <p className="text-[10px] text-primary font-bold mt-2 uppercase">Inclusion Delta: +{analysis.inclusion_delta} Points</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-border/40 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="text-xs">Export PDF</Button>
                  <Button size="sm" className="text-xs">Flag for Manual Audit</Button>
                </div>
              </SheetContent>
            </Sheet>
          ))}
        </div>
      </div>
    </div>
  );
}
