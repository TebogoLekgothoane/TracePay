"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function RegionalInsightsPage() {
  const { user } = useAuth();
  const [regionalData, setRegionalData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Relaxed for demo: allow access regardless of role
    if (user) {
      void loadRegionalData();
      // Stakeholder Portal: Automate global data ingestion on load
      void handleGlobalSync();
    }
  }, [user]);

  async function handleGlobalSync() {
    setRefreshing(true);
    try {
      await apiClient.syncAllData();
      await loadRegionalData();
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadRegionalData() {
    try {
      const data = await apiClient.getRegionalStats();
      setRegionalData(data);
    } catch (error) {
      console.error("Failed to load regional data:", error);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Please sign in to access geographic reports.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-primary">Loading Regional Trends...</div>;
  }

  const chartOptions: any = {
    chart: { type: "bar", toolbar: { show: false } },
    dataLabels: { enabled: true },
    xaxis: { categories: regionalData.map((r) => r.region) },
    colors: ["#a855f7"],
  };

  const chartSeries = [
    {
      name: "Community Health Index",
      data: regionalData.map((r) => r.average_health_score),
    },
  ];

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <div className="p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Regional Geographic Trends</h1>
            <p className="text-muted-foreground">Analyze and compare forensic health across Eastern Cape municipalities</p>
          </div>

          <div className="grid gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Municipal Health Scores</CardTitle>
                <CardDescription>Average community financial health score by region</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart options={chartOptions} series={chartSeries} type="bar" height={400} />
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {regionalData.map((region) => (
                <Card key={region.region}>
                  <CardHeader>
                    <CardTitle>{region.region}</CardTitle>
                    <CardDescription>Aggregate regional metrics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Forensic Index:</span>
                        <span className="font-medium">{region.average_health_score}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Monitored Leaks:</span>
                        <span className="font-medium">{region.total_leaks}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stakeholders:</span>
                        <span className="font-medium">{region.total_users}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Primary Leak:</span>
                        <span className="font-medium text-sm text-primary">{region.top_leak_type}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

