"use client";

import { Chart } from "chart.js";
import { useEffect, useRef } from "react";

import { withDefaults, type ChartBuilder } from "@/lib/charts";
import type { Metrics } from "@/lib/types";

/** One chart. It is rebuilt whenever the data changes and destroyed when it leaves the page. */
export function ChartCanvas({ data, build, label }: { data: Metrics; build: ChartBuilder; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, withDefaults(build(data)));
    return () => chart.destroy();
  }, [data, build]);

  return <canvas ref={canvas} role="img" aria-label={label} />;
}
