"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import dynamic from "next/dynamic";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function AnalysisHistoryPage() {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      // For now, we'll use mock data since we don't have a user analysis history endpoint yet
      // In production, this would call: apiClient.getUserAnalysisHistory()
      loadMockData();
    }
  }, [user]);

  async function loadMockData() {
    // Mock analysis history
    const mockAnalyses = [
      {
        id: 1,
        score: 72,
        band: "yellow",
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        transaction_count: 45,
      },
      {
        id: 2,
        score: 68,
        band: "yellow",
        created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        transaction_count: 52,
      },
      {
        id: 3,
        score: 75,
        band: "green",
        created_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
        transaction_count: 38,
      },
    ];
    setAnalyses(mockAnalyses);
    setLoading(false);
  }

  if (loading) {
    return <div className="p-8">Loading analysis history...</div>;
  }

  const chartOptions = {
    chart: { type: "line", toolbar: { show: false } },
    dataLabels: { enabled: true },
    stroke: { curve: "smooth" },
    xaxis: {
      categories: analyses
        .slice()
        .reverse()
        .map((a) => new Date(a.created_at).toLocaleDateString()),
    },
    colors: ["#a855f7"],
  };

  const chartSeries = [
    {
      name: "Health Score",
      data: analyses.slice().reverse().map((a) => a.score),
    },
  ];

  function getTrendIcon(current: number, previous: number) {
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }

  function getBandColor(band: string) {
    switch (band) {
      case "green":
        return "bg-green-500/20 text-green-400";
      case "yellow":
        return "bg-yellow-500/20 text-yellow-400";
      case "red":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Analysis History</h1>
        <p className="text-muted-foreground">Track your financial health over time</p>
      </div>

      <div className="grid gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Health Score Trend</CardTitle>
            <CardDescription>Your financial health score over time</CardDescription>
          </CardHeader>
          <CardContent>
            <Chart options={chartOptions} series={chartSeries} type="line" height={300} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {analyses.map((analysis, index) => {
            const previous = index < analyses.length - 1 ? analyses[index + 1].score : analysis.score;
            const trend = analysis.score - previous;

            return (
              <Card key={analysis.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Analysis #{analysis.id}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(analysis.score, previous)}
                      <Badge className={getBandColor(analysis.band)}>
                        {analysis.band.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>
                    {new Date(analysis.created_at).toLocaleDateString()} • {analysis.transaction_count} transactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold">{analysis.score}</div>
                      <div className="text-sm text-muted-foreground">Health Score</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {trend >= 0 ? "+" : ""}{trend} from previous
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

