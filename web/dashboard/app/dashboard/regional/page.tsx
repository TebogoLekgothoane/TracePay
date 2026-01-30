"use client";

import React from "react"
import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import { scaleLinear } from "d3-scale";
import { MapPin, TrendingUp, AlertTriangle, Activity } from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection, Feature } from "geojson";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const geoUrl = "/eastern-cape.json";

// Dynamically import Leaflet Map component (no SSR)
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Loading Map...</p>
      </div>
    </div>
  ),
});

// Improved color scales with better contrast
const healthColorScale = scaleLinear<string>()
  .domain([0, 40, 60, 80, 100])
  .range(["#dc2626", "#f97316", "#eab308", "#84cc16", "#22c55e"])
  .clamp(true); // Clamp values to domain range

const opportunityColorScale = scaleLinear<string>()
  .domain([0, 250, 500, 750, 1000])
  .range(["#e0e7ff", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5"])
  .clamp(true); // Clamp values to domain range

// Helper function to get color based on score ranges (more reliable than interpolation)
function getHealthColor(score: number): string {
  if (score < 40) return "#dc2626"; // Critical - Red
  if (score < 60) return "#f97316"; // Poor - Orange
  if (score < 80) return "#eab308"; // Fair - Yellow
  return "#22c55e"; // Good - Green
}

// Legend data
const healthLegend = [
  { color: "#dc2626", label: "Critical (0-40)", range: "High Risk" },
  { color: "#f97316", label: "Poor (40-60)", range: "Elevated" },
  { color: "#eab308", label: "Fair (60-80)", range: "Moderate" },
  { color: "#22c55e", label: "Good (80-100)", range: "Stable" },
];

const opportunityLegend = [
  { color: "#e0e7ff", label: "Low", range: "R0-R50k" },
  { color: "#a5b4fc", label: "Moderate", range: "R50k-R150k" },
  { color: "#818cf8", label: "High", range: "R150k-R300k" },
  { color: "#4f46e5", label: "Very High", range: "R300k+" },
];

// Municipality centers for markers
const municipalityCenters: Record<string, [number, number]> = {
  BUF: [27.75, -32.85],
  NMA: [25.75, -33.85],
  ORT: [29.0, -31.25],
  AMA: [27.25, -32.25],
  CHR: [26.5, -31.75],
  SBA: [24.75, -33.0],
  JGQ: [27.5, -31.0],
  ANZ: [29.25, -30.5],
};

interface RegionData {
  id: string;
  region: string;
  average_health_score: number;
  total_leaks: number;
  top_leak_type: string;
}

// Mock data for development
const mockRegionalData: RegionData[] = [
  { id: "BUF", region: "Buffalo City", average_health_score: 72, total_leaks: 150, top_leak_type: "Bank Fees" },
  { id: "NMA", region: "Nelson Mandela Bay", average_health_score: 68, total_leaks: 200, top_leak_type: "Insurance" },
  { id: "ORT", region: "OR Tambo", average_health_score: 45, total_leaks: 320, top_leak_type: "Informal Lending" },
  { id: "AMA", region: "Amathole", average_health_score: 55, total_leaks: 280, top_leak_type: "Bank Fees" },
  { id: "CHR", region: "Chris Hani", average_health_score: 48, total_leaks: 350, top_leak_type: "Informal Lending" },
  { id: "SBA", region: "Sarah Baartman", average_health_score: 78, total_leaks: 120, top_leak_type: "Insurance" },
  { id: "JGQ", region: "Joe Gqabi", average_health_score: 42, total_leaks: 380, top_leak_type: "Informal Lending" },
  { id: "ANZ", region: "Alfred Nzo", average_health_score: 38, total_leaks: 420, top_leak_type: "Informal Lending" },
];

function MapLegend({ items, title }: { items: typeof healthLegend; title: string }) {
  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-sm border border-border/50 shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-foreground leading-tight">{item.label}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{item.range}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionTooltip({ region, activeTab }: { region: RegionData; activeTab: string }) {
  const opportunityValue = region.total_leaks * 55;
  const isHealthy = region.average_health_score >= 60;

  return (
    <div className="min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm">{region.region}</span>
        <Badge
          variant="outline"
          className={`text-[10px] ${isHealthy ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-red-500/10 text-red-600 border-red-500/30'}`}
        >
          {isHealthy ? "Stable" : "High Risk"}
        </Badge>
      </div>
      <div className="space-y-1.5 text-xs">
        {activeTab === "health" ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Health Score:</span>
              <span className="font-semibold" style={{ color: getHealthColor(region.average_health_score) }}>
                {region.average_health_score}/100
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Risk Level:</span>
              <span className="font-medium">{region.average_health_score < 45 ? "Critical" : region.average_health_score < 60 ? "Elevated" : "Low"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Top Issue:</span>
              <span className="font-medium">{region.top_leak_type}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opportunity:</span>
              <span className="font-semibold text-indigo-600">R{opportunityValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Leakage Points:</span>
              <span className="font-medium">{region.total_leaks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Primary Source:</span>
              <span className="font-medium">{region.top_leak_type}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subValue, trend }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {subValue && (
        <p className="text-xs text-muted-foreground mt-0.5">{subValue}</p>
      )}
    </div>
  );
}

export default function RegionalInsightsPage() {
  const [regionalData, setRegionalData] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("health");
  const [hoveredRegion, setHoveredRegion] = useState<RegionData | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    // Load GeoJSON data
    fetch(geoUrl)
      .then((res) => res.json())
      .then((data) => setGeoJsonData(data))
      .catch((err) => console.error("Error loading GeoJSON:", err));

    // Use mock data for now - replace with actual API call
    const timer = setTimeout(() => {
      console.log("=== LOADING REGIONAL DATA ===");
      setRegionalData(mockRegionalData);
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // GeoJSON style function
  const getFeatureStyle = useCallback((feature?: Feature) => {
    if (!feature) {
      return {
        fillColor: "#9ca3af",
        fillOpacity: 0.8,
        color: "#d1d5db",
        weight: 1,
      };
    }

    const geoId = feature.properties?.id;
    const geoName = feature.properties?.name;
    const region = regionalData.find(
      (s) => s.id === geoId || s.region === geoName
    );

    let fillColor = "#9ca3af"; // Default gray
    if (region) {
      if (activeTab === "health") {
        fillColor = getHealthColor(region.average_health_score);
      } else {
        const opValue = Math.min(region.total_leaks * 2, 1000);
        fillColor = opportunityColorScale(opValue);
      }
    }

    return {
      fillColor,
      fillOpacity: 0.8,
      color: "#d1d5db",
      weight: 1,
    };
  }, [regionalData, activeTab]);

  // Feature interaction handlers
  const onEachFeature = useCallback((feature: Feature, layer: any) => {
    const geoId = feature.properties?.id;
    const geoName = feature.properties?.name;
    const region = regionalData.find(
      (s) => s.id === geoId || s.region === geoName
    );

    if (region) {
      layer.on({
        mouseover: () => {
          setHoveredRegion(region);
          layer.setStyle({
            weight: 2,
            color: "#374151",
            fillOpacity: 0.9,
          });
        },
        mouseout: () => {
          setHoveredRegion(null);
          layer.setStyle(getFeatureStyle(feature));
        },
        click: () => {
          setSelectedRegion(region);
        },
      });
    }
  }, [regionalData, getFeatureStyle]);

  // Calculate summary stats
  const avgHealthScore = Math.round(regionalData.reduce((sum, r) => sum + r.average_health_score, 0) / (regionalData.length || 1));
  const totalOpportunity = regionalData.reduce((sum, r) => sum + r.total_leaks * 55, 0);
  const highRiskCount = regionalData.filter(r => r.average_health_score < 60).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading Regional Data...</p>
        </div>
      </div>
    );
  }

  const currentLegend = activeTab === "health" ? healthLegend : opportunityLegend;
  const legendTitle = activeTab === "health" ? "Forensic Health Index" : "Opportunity Level";

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Regional Intelligence Hub</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Commercial and forensic mapping for Eastern Cape municipalities
              </p>
            </div>
            <Badge variant="outline" className="w-fit text-xs bg-green-500/10 text-green-600 border-green-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              Live Data
            </Badge>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Activity}
              label="Avg Health Score"
              value={`${avgHealthScore}/100`}
              subValue={avgHealthScore >= 60 ? "Healthy Range" : "Needs Attention"}
            />
            <StatCard
              icon={TrendingUp}
              label="Total Opportunity"
              value={`R${(totalOpportunity / 1000).toFixed(0)}k`}
              subValue="Recoverable Capital"
            />
            <StatCard
              icon={AlertTriangle}
              label="High Risk Areas"
              value={`${highRiskCount}`}
              subValue={`of ${regionalData.length} municipalities`}
            />
            <StatCard
              icon={MapPin}
              label="Coverage"
              value="8"
              subValue="Municipalities tracked"
            />
          </div>

          {/* Map Section */}
          <Tabs defaultValue="health" onValueChange={setActiveTab} className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <TabsList className="bg-secondary w-fit">
                <TabsTrigger value="health" className="text-xs">
                  <Activity className="w-3.5 h-3.5 mr-1.5" />
                  Forensic Health
                </TabsTrigger>
                <TabsTrigger value="commercial" className="text-xs">
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                  Commercial Opportunity
                </TabsTrigger>
              </TabsList>
            </div>

            <Card className="overflow-hidden">
              <CardHeader className="pb-2 border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {activeTab === "health" ? "Geographic Forensic Health Map" : "Retail Spend Opportunity Map"}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {activeTab === "health"
                        ? "Hover over regions to see health scores. Red areas indicate high fee sensitivity and informal lending prevalence."
                        : "Darker purple regions indicate higher recovered capital available for retail spend."}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 relative">
                {/* Leaflet Map Container */}
                <div className="h-[450px] md:h-[500px] w-full bg-white relative">
                  {geoJsonData && !loading ? (
                    <LeafletMap
                      geoJsonData={geoJsonData}
                      getFeatureStyle={getFeatureStyle}
                      onEachFeature={onEachFeature}
                      activeTab={activeTab}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">Loading Map Data...</p>
                      </div>
                    </div>
                  )}

                  {/* Legend Overlay */}
                  <div className="absolute bottom-4 left-4 z-[1000] pointer-events-none">
                    <div className="pointer-events-auto">
                      <MapLegend items={currentLegend} title={legendTitle} />
                    </div>
                  </div>

                  {/* Hover Tooltip */}
                  {hoveredRegion && (
                    <div className="absolute top-4 right-4 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-xl">
                      <RegionTooltip region={hoveredRegion} activeTab={activeTab} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Tabs>

          {/* Region Cards */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Municipality Details</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {regionalData.map((region) => {
                const isHealthy = region.average_health_score >= 60;
                const opportunityValue = region.total_leaks * 55;
                const isSelected = selectedRegion?.id === region.id;

                return (
                  <Card
                    key={region.region}
                    className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary shadow-md" : ""
                      }`}
                    onClick={() => setSelectedRegion(region)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-semibold truncate">{region.region}</CardTitle>
                          <CardDescription className="text-[10px] uppercase tracking-wide mt-0.5">
                            {region.id}
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${isHealthy
                            ? "bg-green-500/10 text-green-600 border-green-500/30"
                            : "bg-red-500/10 text-red-600 border-red-500/30"
                            }`}
                        >
                          {isHealthy ? "Stable" : "At Risk"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {/* Health Score Bar */}
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-xs text-muted-foreground">Health Score</span>
                            <span className="text-sm font-bold" style={{ color: getHealthColor(region.average_health_score) }}>
                              {region.average_health_score}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${region.average_health_score}%`,
                                backgroundColor: getHealthColor(region.average_health_score),
                              }}
                            />
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Opportunity</p>
                            <p className="text-sm font-semibold text-indigo-600">R{opportunityValue.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Top Issue</p>
                            <p className="text-xs font-medium truncate">{region.top_leak_type}</p>
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
      </div>
    </TooltipProvider>
  );
}
