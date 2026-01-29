"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function RegionalInsightsPage() {
  const { user } = useAuth();
  const [regionalData, setRegionalData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role === "admin") {
      loadRegionalData();
    }
  }, [user]);

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

  if (!user || user.role !== "admin") {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8">Loading regional insights...</div>;
  }

  const chartOptions = {
    chart: { type: "bar", toolbar: { show: false } },
    dataLabels: { enabled: true },
    xaxis: { categories: regionalData.map((r) => r.region) },
    colors: ["#a855f7"],
  };

  const chartSeries = [
    {
      name: "Average Health Score",
      data: regionalData.map((r) => r.average_health_score),
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Regional Insights</h1>
        <p className="text-muted-foreground">Compare financial health across regions</p>
      </div>

      <div className="grid gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Regional Health Scores</CardTitle>
            <CardDescription>Average financial health score by region</CardDescription>
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
                <CardDescription>Regional statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Health Score:</span>
                    <span className="font-medium">{region.average_health_score}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Leaks:</span>
                    <span className="font-medium">{region.total_leaks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Users:</span>
                    <span className="font-medium">{region.total_users}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Top Leak:</span>
                    <span className="font-medium text-sm">{region.top_leak_type}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

