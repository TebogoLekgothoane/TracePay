"use client";

import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Feature } from "geojson";
import type { Map as LeafletMapType, GeoJSON as GeoJSONType } from "leaflet";
import "leaflet/dist/leaflet.css";

interface LeafletMapProps {
  geoJsonData: FeatureCollection;
  getFeatureStyle: (feature?: Feature) => any;
  onEachFeature: (feature: Feature, layer: any) => void;
  activeTab: string;
}

export default function LeafletMapComponent({
  geoJsonData,
  getFeatureStyle,
  onEachFeature,
  activeTab,
}: LeafletMapProps) {
  const [isMounted, setIsMounted] = useState(false);
  const mapRef = useRef<LeafletMapType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const geoJsonLayerRef = useRef<GeoJSONType | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // Check if we're in the browser
    if (typeof window === "undefined") return;

    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !containerRef.current) return;

    // Prevent double initialization
    if (isInitializedRef.current && mapRef.current) {
      return;
    }

    // Dynamic import to avoid SSR issues
    import("leaflet").then((L) => {
      if (!containerRef.current) return;
      
      // Double-check if map was already initialized
      if (isInitializedRef.current && mapRef.current) {
        return;
      }

      try {
        // Create the map
        const map = L.map(containerRef.current, {
          center: [-32.5, 27.5],
          zoom: 7,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        // Add tile layer
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        mapRef.current = map;
        isInitializedRef.current = true;

        // Add GeoJSON layer
        const geoJsonLayer = L.geoJSON(geoJsonData, {
          style: getFeatureStyle,
          onEachFeature: onEachFeature,
        });
        geoJsonLayer.addTo(map);
        geoJsonLayerRef.current = geoJsonLayer;
      } catch (error) {
        console.error("Error initializing map:", error);
      }
    });

    // Cleanup function
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
          mapRef.current = null;
          isInitializedRef.current = false;
        } catch (e) {
          console.warn("Error cleaning up map:", e);
        }
      }
    };
  }, [isMounted]);

  // Update GeoJSON layer when activeTab or data changes
  useEffect(() => {
    if (!mapRef.current || !geoJsonLayerRef.current) return;

    // Remove old layer
    if (geoJsonLayerRef.current) {
      mapRef.current.removeLayer(geoJsonLayerRef.current);
    }

    // Dynamic import for updating
    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      // Add new layer with updated styles
      const newGeoJsonLayer = L.geoJSON(geoJsonData, {
        style: getFeatureStyle,
        onEachFeature: onEachFeature,
      });
      newGeoJsonLayer.addTo(mapRef.current);
      geoJsonLayerRef.current = newGeoJsonLayer;

      // Invalidate size to ensure proper rendering
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    });
  }, [activeTab, getFeatureStyle, onEachFeature, geoJsonData]);

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Initializing Map...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      style={{ height: "100%", width: "100%" }}
      className="leaflet-container"
    />
  );
}