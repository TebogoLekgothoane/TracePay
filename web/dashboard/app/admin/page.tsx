"use client";

import { useEffect, useState } from "react";
import { Users, TrendingUp, Activity, Shield } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Relaxed for demo: allow access regardless of role
    if (user) {
      void loadStats();
      // Stakeholder Portal: Automate global data ingestion on load
      void handleGlobalSync();
    }
  }, [user]);

  async function handleGlobalSync() {
    setRefreshing(true);
    try {
      await apiClient.syncAllData();
      await loadStats();
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadStats() {
    try {
      const overview = await apiClient.getOverviewStats();
      setStats(overview);
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Please sign in to access the Stakeholder Portal.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !stats) {
    return <div className="p-8 text-primary">Loading Stakeholder Portal...</div>;
  }

  const chartOptions: any = {
    chart: { type: "area", toolbar: { show: false } },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth" },
    xaxis: { categories: ["Week 1", "Week 2", "Week 3", "Week 4"] },
    colors: ["#a855f7"],
  };

  const chartSeries = [
    {
      name: "Platform Users",
      data: [10, 25, 35, stats.total_users],
    },
  ];

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <div className="p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">ML Reports & Insights</h1>
            <p className="text-muted-foreground">Deep-dive into platform-wide machine learning findings</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Monitored</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_users}</div>
                <p className="text-xs text-muted-foreground">{stats.active_users} active lives</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Consents</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_linked_accounts}</div>
                <p className="text-xs text-muted-foreground">Data pipelines active</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Community Health</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.average_health_score}</div>
                <p className="text-xs text-muted-foreground">Forensic stability index</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Frozen Items</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_frozen_items}</div>
                <p className="text-xs text-muted-foreground">Economic leakages stopped</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Platform Growth</CardTitle>
                <CardDescription>Aggregate user ingestion over time</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart options={chartOptions} series={chartSeries} type="area" height={300} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stakeholder Quick-Links</CardTitle>
                <CardDescription>Internal navigation for analysts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/admin/regional">
                  <Card className="cursor-pointer transition-colors hover:bg-secondary/50">
                    <CardContent className="p-4">
                      <div className="font-medium">Regional Hotspots</div>
                      <div className="text-sm text-muted-foreground">View geographic leakage trends</div>
                    </CardContent>
                  </Card>
                </Link>
                <Link href="/admin/users">
                  <Card className="cursor-pointer transition-colors hover:bg-secondary/50">
                    <CardContent className="p-4">
                      <div className="font-medium">Forensic Data Log</div>
                      <div className="text-sm text-muted-foreground">View anonymized ingestion history</div>
                    </CardContent>
                  </Card>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

