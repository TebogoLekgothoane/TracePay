"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup
} from "react-simple-maps";
import { scaleLinear } from "d3-scale";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const geoUrl = "/eastern-cape.json";

const colorScale = scaleLinear<string>()
  .domain([40, 70, 90])
  .range(["#ef4444", "#eab308", "#22c55e"]);

const opportunityScale = scaleLinear<string>()
  .domain([0, 500, 1000])
  .range(["#f3f4f6", "#a855f7", "#6b21a8"]);

export default function RegionalInsightsPage() {
  const [regionalData, setRegionalData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("health");

  useEffect(() => {
    void loadRegionalData();
  }, []);

  async function loadRegionalData() {
    try {
      const data = await apiClient.getRegionalStats();
      // Map IDs to match geojson IDs for all 8 EC Municipalities
      const mappedData = data.map((r: any) => {
        const name = r.region;
        let id = "UNKNOWN";
        if (name === "Buffalo City") id = "BUF";
        if (name === "Nelson Mandela Bay") id = "NMA";
        if (name === "OR Tambo") id = "ORT";
        if (name === "Amathole") id = "AMA";
        if (name === "Chris Hani") id = "CHR";
        if (name === "Sarah Baartman") id = "SBA";
        if (name === "Joe Gqabi") id = "JGQ";
        if (name === "Alfred Nzo") id = "ANZ";
        return { ...r, id };
      });
      setRegionalData(mappedData);
    } catch (error) {
      console.error("Failed to load regional data:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-primary font-medium">Loading Regional Trends...</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Regional Intelligence Hub</h1>
        <p className="text-muted-foreground italic">Commercial and forensic mapping for Eastern Cape stakeholders</p>
      </div>

      <div className="grid gap-6">
        <Tabs defaultValue="health" onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="health">Forensic Health</TabsTrigger>
              <TabsTrigger value="commercial">Commercial Opportunity</TabsTrigger>
            </TabsList>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Live Feed: Eastern Cape
            </Badge>
          </div>

          <Card className="overflow-hidden border-border/70">
            <CardHeader className="bg-secondary/5 border-b border-border/40">
              <CardTitle className="text-sm flex items-center gap-2">
                {activeTab === "health" ? "Geographic Forensic Map" : "Retail Spend Velocity Map"}
              </CardTitle>
              <CardDescription className="text-xs">
                {activeTab === "health"
                  ? "Areas in red show high fee sensitivity and mailbox effect prevalence."
                  : "Darker regions indicate higher 'Recovered Capital' available for retail spend."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 bg-background/50">
              <div className="h-[400px] w-full bg-slate-900/10 flex items-center justify-center">
                <ComposableMap
                  projection="geoMercator"
                  projectionConfig={{
                    scale: 3500,
                    center: [27.5, -32.5]
                  }}
                  width={800}
                  height={400}
                >
                  <ZoomableGroup zoom={1} maxZoom={3}>
                    <Geographies geography={geoUrl}>
                      {({ geographies }) =>
                        geographies.map((geo) => {
                          const region = regionalData.find((s) => s.id === geo.properties.id);
                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              fill={
                                region
                                  ? activeTab === "health"
                                    ? colorScale(region.average_health_score)
                                    : opportunityScale(region.total_leaks * 5) // Mock opportunity scale
                                  : "#EAEAEC"
                              }
                              stroke="#FFF"
                              strokeWidth={0.5}
                              style={{
                                default: { outline: "none" },
                                hover: { fill: "#6366f1", outline: "none", cursor: "pointer" },
                                pressed: { outline: "none" },
                              }}
                            />
                          );
                        })
                      }
                    </Geographies>
                    {regionalData.map((region) => {
                      // Extended mapping for marker centers for all 8 municipalities
                      const centers: any = {
                        BUF: [27.75, -32.85],
                        NMA: [25.75, -33.85],
                        ORT: [29.0, -31.25],
                        AMA: [27.25, -32.25],
                        CHR: [26.5, -31.75],
                        SBA: [24.75, -33.0],
                        JGQ: [27.5, -31.0],
                        ANZ: [29.25, -30.5],
                      };
                      if (!centers[region.id]) return null;
                      return (
                        <Marker key={region.id} coordinates={centers[region.id]}>
                          <text
                            textAnchor="middle"
                            y={-10}
                            style={{ fontFamily: "Inter", fill: "#1e293b", fontSize: "10px", fontWeight: "bold" }}
                          >
                            {region.region}
                          </text>
                        </Marker>
                      );
                    })}
                  </ZoomableGroup>
                </ComposableMap>
              </div>
            </CardContent>
          </Card>
        </Tabs>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {regionalData.map((region) => (
            <Card key={region.region} className="border-border/70 hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{region.region}</CardTitle>
                  <Badge variant="outline" className={region.average_health_score > 60 ? "text-primary border-primary/20 bg-primary/5 text-[10px]" : "text-red-400 border-red-400/20 bg-red-400/10 text-[10px]"}>
                    {region.average_health_score > 60 ? "Stable" : "High Risk"}
                  </Badge>
                </div>
                <CardDescription className="text-xs uppercase tracking-tighter">Municipality ID: {region.id}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-1 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">Forensic Index:</span>
                    <span className="font-bold text-sm">{region.average_health_score}/100</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">Retail Spend Opportunity:</span>
                    <span className="font-bold text-sm text-primary">R{(region.total_leaks * 55).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">Main Leakage Source:</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{region.top_leak_type}</span>
                  </div>
                  <div className="mt-4 p-3 bg-secondary/20 rounded-lg">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Commercial Insight</p>
                    <p className="text-[11px] leading-snug italic text-muted-foreground">
                      "{region.region} shows a {region.average_health_score < 60 ? 'high' : 'moderate'} correlation between bank fee sensitivity and informal lending usage."
                    </p>
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
