"use client";

import { useEffect, useState } from "react";
import { Flame, TrendingUp, Users, Wallet } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiClient } from "@/lib/api";

type Overview = Awaited<ReturnType<typeof apiClient.getInvestorOverview>>;

export default function InvestorOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setOverview(await apiClient.getInvestorOverview());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load investor overview.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading overview...</div>;
  }

  if (error || !overview) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error ?? "No data available."}
      </div>
    );
  }

  const stats = [
    {
      label: "Total users",
      value: overview.total_users.toLocaleString(),
      icon: Users,
    },
    {
      label: "Active users (30d)",
      value: overview.active_users.toLocaleString(),
      icon: TrendingUp,
    },
    {
      label: "Analyses run",
      value: overview.total_analyses.toLocaleString(),
      icon: Flame,
    },
    {
      label: "Avg. health score",
      value: `${overview.average_health_score.toFixed(1)} / 100`,
      icon: TrendingUp,
    },
    {
      label: "Savings identified / mo",
      value: `R${overview.total_capital_protected.toLocaleString()}`,
      icon: Wallet,
    },
    {
      label: "Leaks frozen",
      value: overview.total_frozen_items.toLocaleString(),
      icon: Flame,
    },
  ];

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Growth &amp; Impact</h1>
        <p className="text-sm text-muted-foreground">
          Aggregate, platform-wide figures. No individual user is ever identifiable here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
