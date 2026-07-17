"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import { scaleLinear } from "d3-scale";
import {
  MapPin,
  TrendingUp,
  AlertTriangle,
  Activity,
  Globe,
  ArrowUpRight,
  Target,
  Zap,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection, Feature } from "geojson";
import type { Layer, Path } from "leaflet";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiClient } from "@/lib/api";
import { getCachedData, setCachedData } from "@/lib/data-cache";

const geoUrl = "/eastern-cape.json";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full bg-secondary/30">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground font-medium">Loading Map...</p>
      </div>
    </div>
  ),
});

const opportunityColorScale = scaleLinear<string>()
  .domain([0, 250, 500, 750, 1000])
  .range(["#e9d5ff", "#c084fc", "#a855f7", "#9333ea", "#7c3aed"])
  .clamp(true);

function getHealthColor(score: number): string {
  if (score < 40) return "#ef4444";
  if (score < 60) return "#f97316";
  if (score < 80) return "#eab308";
  return "#22c55e";
}

function getHealthLabel(score: number): string {
  if (score < 40) return "Critical";
  if (score < 60) return "Poor";
  if (score < 80) return "Fair";
  return "Good";
}

const healthLegend = [
  { color: "#ef4444", label: "Critical", range: "0-40" },
  { color: "#f97316", label: "Poor", range: "40-60" },
  { color: "#eab308", label: "Fair", range: "60-80" },
  { color: "#22c55e", label: "Good", range: "80-100" },
];

const opportunityLegend = [
  { color: "#e9d5ff", label: "Low", range: "R0-R50k" },
  { color: "#c084fc", label: "Moderate", range: "R50k-R150k" },
  { color: "#a855f7", label: "High", range: "R150k-R300k" },
  { color: "#7c3aed", label: "Very High", range: "R300k+" },
];

interface RegionData {
  id: string;
  region: string;
  average_health_score: number;
  total_leaks: number;
  total_users: number;
  top_leak_type: string;
}

const REGION_IDS: Record<string, string> = {
  "Buffalo City": "BUF",
  "Nelson Mandela Bay": "NMA",
  "OR Tambo": "ORT",
  Amathole: "AMA",
  "Chris Hani": "CHR",
  "Sarah Baartman": "SBA",
  "Joe Gqabi": "JGQ",
  "Alfred Nzo": "ANZ",
};

function toRegionData(region: {
  region: string;
  average_health_score: number;
  total_leaks: number;
  total_users: number;
  top_leak_type: string;
}): RegionData {
  return {
    id: REGION_IDS[region.region] ?? region.region,
    region: region.region,
    average_health_score: region.average_health_score,
    total_leaks: region.total_leaks,
    total_users: region.total_users,
    top_leak_type: region.top_leak_type,
  };
}

function MapLegend({ items, title }: { items: typeof healthLegend; title: string }) {
  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl p-4 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-3">{title}</p>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div
              className="w-5 h-3 rounded-sm shrink-0 shadow-sm"
              style={{ backgroundColor: item.color }}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">{item.label}</span>
              <span className="text-[10px] text-muted-foreground">({item.range})</span>
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
    <div className="min-w-[220px]">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <span className="font-semibold text-sm text-foreground">{region.region}</span>
        <Badge
          className={`text-[10px] ${
            isHealthy 
              ? "bg-green-500/15 text-green-600 border-green-500/30" 
              : "bg-red-500/15 text-red-600 border-red-500/30"
          }`}
        >
          {isHealthy ? "Stable" : "At Risk"}
        </Badge>
      </div>
      <div className="space-y-2">
        {activeTab === "health" ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Health Score</span>
              <span className="text-sm font-bold" style={{ color: getHealthColor(region.average_health_score) }}>
                {region.average_health_score}/100
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${region.average_health_score}%`,
                  backgroundColor: getHealthColor(region.average_health_score),
                }}
              />
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-xs text-muted-foreground">Top Issue</span>
              <span className="text-xs font-medium text-foreground">{region.top_leak_type}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Opportunity Value</span>
              <span className="text-sm font-bold text-primary">R{opportunityValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Leakage Points</span>
              <span className="text-xs font-medium text-foreground">{region.total_leaks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Primary Source</span>
              <span className="text-xs font-medium text-foreground">{region.top_leak_type}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function RegionalInsightsPage() {
  const [regionalData, setRegionalData] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("health");
  const [hoveredRegion, setHoveredRegion] = useState<RegionData | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cachedGeoJson = getCachedData<FeatureCollection>("regional_geojson", 60 * 60 * 1000);
    if (cachedGeoJson) {
      setGeoJsonData(cachedGeoJson);
    } else {
      fetch(geoUrl)
        .then((res) => res.json())
        .then((data) => {
          setGeoJsonData(data);
          setCachedData("regional_geojson", data);
        })
        .catch((err) => console.error("Error loading GeoJSON:", err));
    }

    async function loadRegionalStats() {
      setLoading(true);
      setError(null);
      try {
        const stats = await apiClient.getRegionalStats();
        if (cancelled) return;
        setRegionalData(stats.map(toRegionData));
      } catch (err) {
        if (cancelled) return;
        console.error("Error loading regional stats:", err);
        setRegionalData([]);
        setError("Could not load regional metrics from the backend.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRegionalStats();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedRegion) return;
    const stillExists = regionalData.some((region) => region.id === selectedRegion.id);
    if (!stillExists) {
      setSelectedRegion(null);
    }
  }, [regionalData, selectedRegion]);

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

    let fillColor = "#9ca3af";
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
      fillOpacity: 0.85,
      color: "#ffffff",
      weight: 2,
    };
  }, [regionalData, activeTab]);

  const onEachFeature = useCallback((feature: Feature, layer: Layer) => {
    const path = layer as Path;
    const geoId = feature.properties?.id;
    const geoName = feature.properties?.name;
    const region = regionalData.find(
      (s) => s.id === geoId || s.region === geoName
    );

    if (region) {
      path.on({
        mouseover: () => {
          setHoveredRegion(region);
          path.setStyle({
            weight: 3,
            color: "#7c3aed",
            fillOpacity: 0.95,
          });
        },
        mouseout: () => {
          setHoveredRegion(null);
          path.setStyle(getFeatureStyle(feature));
        },
        click: () => {
          setSelectedRegion(region);
        },
      });
    }
  }, [regionalData, getFeatureStyle]);

  const avgHealthScore = Math.round(regionalData.reduce((sum, r) => sum + r.average_health_score, 0) / (regionalData.length || 1));
  const totalOpportunity = regionalData.reduce((sum, r) => sum + r.total_leaks * 55, 0);
  const highRiskCount = regionalData.filter(r => r.average_health_score < 60).length;
  const totalLeaks = regionalData.reduce((sum, r) => sum + r.total_leaks, 0);
  const hasRegionalData = regionalData.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Loading Regional Data...</p>
        </div>
      </div>
    );
  }

  const currentLegend = activeTab === "health" ? healthLegend : opportunityLegend;
  const legendTitle = activeTab === "health" ? "Health Index" : "Opportunity Level";

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Hero Header */}
        <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/15 rounded-xl backdrop-blur-sm">
                  <Globe className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Regional Intelligence Hub</h1>
                  <p className="text-primary-foreground/80 mt-1">
                    Commercial and forensic mapping for Eastern Cape municipalities
                  </p>
                </div>
              </div>
              <Badge className="w-fit bg-white/20 text-primary-foreground border-white/30 hover:bg-white/25">
                <span className={`w-2 h-2 rounded-full mr-2 ${hasRegionalData ? "bg-green-400" : "bg-white/50"}`} />
                {hasRegionalData ? "Backend Data" : "No Regional Data Yet"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          )}

          {!hasRegionalData && !error && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              No regional metrics are available yet. Add regional statistics in the backend to populate the map and municipality cards.
            </div>
          )}

          {/* Summary Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 -mt-12">
            <Card className="bg-card shadow-lg border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">Avg Health Score</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-foreground">{avgHealthScore}</span>
                  <span className="text-muted-foreground text-sm mb-1">/100</span>
                </div>
                <Progress value={avgHealthScore} className="h-2 mt-3" />
              </CardContent>
            </Card>

            <Card className="bg-card shadow-lg border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-green-500/10">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">Total Opportunity</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-foreground">R{(totalOpportunity / 1000).toFixed(0)}k</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Recoverable capital across regions</p>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-lg border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">High Risk Areas</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-foreground">{highRiskCount}</span>
                  <span className="text-muted-foreground text-sm mb-1">of {regionalData.length}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {hasRegionalData ? "Municipalities need attention" : "Waiting for regional metrics"}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-lg border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">Total Leakage</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-foreground">{totalLeaks.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Financial leak points detected</p>
              </CardContent>
            </Card>
          </div>

          {/* Map Section */}
          <Card className="overflow-hidden shadow-lg border-0">
            <CardHeader className="bg-secondary/30 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-semibold text-foreground">
                    {activeTab === "health" ? "Geographic Health Map" : "Retail Opportunity Map"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {!hasRegionalData
                      ? "Regional metrics are not available yet, so districts are shown without scores."
                      : activeTab === "health"
                        ? "Hover over regions to view health scores. Red indicates high financial stress."
                        : "Darker purple regions have higher retail spending potential."}
                  </CardDescription>
                </div>
                <Tabs defaultValue="health" onValueChange={setActiveTab}>
                  <TabsList className="bg-muted/70">
                    <TabsTrigger value="health" className="text-xs gap-1.5 data-[state=active]:bg-card">
                      <Activity className="w-3.5 h-3.5" />
                      Health Index
                    </TabsTrigger>
                    <TabsTrigger value="commercial" className="text-xs gap-1.5 data-[state=active]:bg-card">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Opportunity
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="p-0 relative">
              <div className="h-[450px] md:h-[520px] w-full bg-secondary/20 relative">
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
                      <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-sm text-muted-foreground font-medium">Loading Map Data...</p>
                    </div>
                  </div>
                )}

                {hasRegionalData ? (
                  <div className="absolute bottom-4 left-4 z-[1000] pointer-events-none">
                    <div className="pointer-events-auto">
                      <MapLegend items={currentLegend} title={legendTitle} />
                    </div>
                  </div>
                ) : (
                  <div className="absolute bottom-4 left-4 right-4 z-[1000] rounded-xl border border-border bg-card/95 p-4 text-sm text-muted-foreground shadow-lg backdrop-blur-md md:right-auto md:max-w-sm">
                    No regional data yet.
                  </div>
                )}

                {/* Hover Tooltip */}
                {hoveredRegion && (
                  <div className="absolute top-4 right-4 z-[1000] bg-card/98 backdrop-blur-md border border-border rounded-xl p-4 shadow-xl">
                    <RegionTooltip region={hoveredRegion} activeTab={activeTab} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Municipality Details Grid */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Municipality Details</h2>
                <p className="text-sm text-muted-foreground mt-1">Click on a card to view detailed insights</p>
              </div>
              <Badge variant="outline" className="text-xs">
                <MapPin className="w-3 h-3 mr-1.5" />
                {regionalData.length} Regions
              </Badge>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {hasRegionalData ? regionalData
                .slice()
                .sort((a, b) => a.average_health_score - b.average_health_score)
                .map((region) => {
                  const isHealthy = region.average_health_score >= 60;
                  const opportunityValue = region.total_leaks * 55;
                  const isSelected = selectedRegion?.id === region.id;

                  return (
                    <Card
                      key={region.id}
                      className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
                        isSelected ? "ring-2 ring-primary shadow-lg" : ""
                      }`}
                      onClick={() => setSelectedRegion(region)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <CardTitle className="text-sm font-semibold truncate text-foreground">
                              {region.region}
                            </CardTitle>
                            <CardDescription className="text-[10px] uppercase tracking-wider mt-1 font-medium">
                              {region.id} District
                            </CardDescription>
                          </div>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge
                                className={`text-[10px] shrink-0 ${
                                  isHealthy
                                    ? "bg-green-500/15 text-green-600 border-green-500/30"
                                    : "bg-red-500/15 text-red-600 border-red-500/30"
                                }`}
                              >
                                {isHealthy ? "Stable" : "At Risk"}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{isHealthy ? "Financial health is stable" : "Requires intervention"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-4">
                          {/* Health Score */}
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-muted-foreground">Health Score</span>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-lg font-bold"
                                  style={{ color: getHealthColor(region.average_health_score) }}
                                >
                                  {region.average_health_score}
                                </span>
                                <span className="text-xs text-muted-foreground">/100</span>
                              </div>
                            </div>
                            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${region.average_health_score}%`,
                                  backgroundColor: getHealthColor(region.average_health_score),
                                }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1.5">
                              {getHealthLabel(region.average_health_score)} - {region.average_health_score < 60 ? "Needs attention" : "Performing well"}
                            </p>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                            <div className="bg-secondary/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Opportunity</p>
                              <p className="text-sm font-bold text-primary">R{opportunityValue.toLocaleString()}</p>
                            </div>
                            <div className="bg-secondary/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Top Issue</p>
                              <p className="text-xs font-semibold text-foreground truncate">{region.top_leak_type}</p>
                            </div>
                          </div>

                          {/* View Details Link */}
                          <div className="flex items-center justify-end pt-1">
                            <span className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
                              View Details
                              <ArrowUpRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }) : (
                  <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No municipality details are available yet.
                  </div>
                )}
            </div>
          </div>

          {/* Selected Region Detail Panel */}
          {selectedRegion && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10">
                      <Target className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{selectedRegion.region} - Detailed Analysis</CardTitle>
                      <CardDescription>Comprehensive breakdown of financial health metrics</CardDescription>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedRegion(null)}
                    className="text-muted-foreground hover:text-foreground text-sm"
                  >
                    Close
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Health Score</p>
                    <div className="flex items-end gap-2">
                      <span
                        className="text-4xl font-bold"
                        style={{ color: getHealthColor(selectedRegion.average_health_score) }}
                      >
                        {selectedRegion.average_health_score}
                      </span>
                      <span className="text-muted-foreground mb-1">/100</span>
                    </div>
                    <Progress value={selectedRegion.average_health_score} className="h-3" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Recovery Opportunity</p>
                    <p className="text-4xl font-bold text-primary">
                      R{(selectedRegion.total_leaks * 55).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      From {selectedRegion.total_leaks} identified leakage points
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Primary Issue</p>
                    <p className="text-2xl font-bold text-foreground">{selectedRegion.top_leak_type}</p>
                    <p className="text-xs text-muted-foreground">
                      Most common financial drain in this region
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
