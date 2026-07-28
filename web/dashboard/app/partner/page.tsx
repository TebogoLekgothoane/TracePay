"use client";

import { useEffect, useState } from "react";
import { Gift, Percent, Wallet } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiClient } from "@/lib/api";

type Summary = Awaited<ReturnType<typeof apiClient.getPartnerSummary>>;

export default function PartnerOverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSummary(await apiClient.getPartnerSummary());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load your partner summary."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading overview...</div>;
  }

  if (error || !summary) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error ?? "No partner account is linked to this login yet. Contact TracePay to get set up."}
      </div>
    );
  }

  const stats = [
    {
      label: "Total redemptions",
      value: summary.total_redemptions.toLocaleString(),
      icon: Gift,
    },
    {
      label: "Points redeemed",
      value: summary.total_points_redeemed.toLocaleString(),
      icon: Percent,
    },
    {
      label: "Commission owed",
      value: `R${summary.total_commission_owed.toLocaleString()}`,
      icon: Wallet,
    },
  ];

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{summary.partner_name}</h1>
        <p className="text-sm text-muted-foreground">
          Redemptions of your offer and the commission TracePay owes you.
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
