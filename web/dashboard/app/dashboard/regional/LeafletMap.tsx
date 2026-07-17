"use client";

import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Feature } from "geojson";
import type { Map as LeafletMapType, GeoJSON as GeoJSONType, Layer } from "leaflet";
import "leaflet/dist/leaflet.css";

interface LeafletMapProps {
  geoJsonData: FeatureCollection;
  getFeatureStyle: (feature?: Feature) => object;
  onEachFeature: (feature: Feature, layer: Layer) => void;
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
    if (typeof window === "undefined") return;
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !containerRef.current) return;

    if (isInitializedRef.current && mapRef.current) {
      return;
    }

    import("leaflet").then((L) => {
      if (!containerRef.current) return;
      
      if (isInitializedRef.current && mapRef.current) {
        return;
      }

      try {
        const map = L.map(containerRef.current, {
          center: [-32.5, 27.5],
          zoom: 7,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        mapRef.current = map;
        isInitializedRef.current = true;

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
  }, [isMounted, geoJsonData, getFeatureStyle, onEachFeature]);

  useEffect(() => {
    if (!mapRef.current || !geoJsonLayerRef.current) return;

    if (geoJsonLayerRef.current) {
      mapRef.current.removeLayer(geoJsonLayerRef.current);
    }

    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      const newGeoJsonLayer = L.geoJSON(geoJsonData, {
        style: getFeatureStyle,
        onEachFeature: onEachFeature,
      });
      newGeoJsonLayer.addTo(mapRef.current);
      geoJsonLayerRef.current = newGeoJsonLayer;

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