import { Chart, registerables, type ChartConfiguration } from "chart.js";

import { capitalise, pct, productName, shortDate, zar } from "./format";
import type { Metrics } from "./types";

Chart.register(...registerables);
Chart.defaults.font.size = 14;
Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";

// Chart.js configs mix bar, line and doughnut options in ways its generics make awkward.
const asConfig = (config: unknown): ChartConfiguration => config as ChartConfiguration;

// Colours come from the CSS variables in globals.css, so the charts and the page cannot drift.
const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const palette = (): string[] => ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"].map(css);

function hexAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#") || hex.length !== 7) return color;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type Plain = Record<string, unknown>;

function mergeDeep(target: Plain, source: Plain): Plain {
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const existing = target[key];
      target[key] = mergeDeep(existing && typeof existing === "object" ? (existing as Plain) : {}, value as Plain);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/** The shared look: thin gridlines, muted ticks, plain dark tooltips. */
export function withDefaults(config: ChartConfiguration): ChartConfiguration {
  const isRound = config.type === "doughnut";
  const base: Plain = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: { color: css("--ink-2"), boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded" },
      },
      tooltip: {
        backgroundColor: "#1a1c1f",
        titleColor: "#fff",
        bodyColor: "#f1f1ef",
        padding: 10,
        cornerRadius: 4,
        displayColors: false,
      },
    },
  };
  const options = mergeDeep(base, (config.options ?? {}) as Plain) as Plain;
  if (!isRound) {
    const axis = (): Plain => ({
      border: { display: false },
      grid: { color: css("--rule") },
      ticks: { color: css("--muted"), maxRotation: 0, autoSkip: true },
    });
    const scales = (options.scales ?? {}) as Record<string, Plain>;
    const horizontal = options.indexAxis === "y";
    const x = mergeDeep(axis(), scales.x ?? {});
    const y = mergeDeep(axis(), scales.y ?? {});
    x.grid = horizontal ? { color: css("--rule") } : { display: false };
    if (horizontal) y.grid = { display: false };
    options.scales = { ...scales, x, y };
  }
  return asConfig({ ...config, options });
}

const lineSeries = (
  labels: string[],
  items: { label: string; data: number[]; color: string; fill?: boolean }[],
) =>
  asConfig({
    type: "line",
    data: {
      labels: labels.map(shortDate),
      datasets: items.map((s) => ({
        label: s.label,
        data: s.data,
        borderColor: s.color,
        backgroundColor: hexAlpha(s.color, 0.08),
        fill: !!s.fill,
        tension: 0.25,
        pointRadius: labels.length > 45 ? 0 : 2,
        pointBackgroundColor: s.color,
        borderWidth: 1.75,
      })),
    },
  });

function doughnut(labels: string[], values: number[], emptyLabel: string): ChartConfiguration {
  const empty = !values.some((v) => v > 0);
  return asConfig({
    type: "doughnut",
    data: {
      labels: empty ? [emptyLabel] : labels,
      datasets: [
        {
          data: empty ? [1] : values,
          backgroundColor: empty ? [css("--rule-strong")] : palette(),
          borderColor: css("--surface"),
          borderWidth: 2,
        },
      ],
    },
    options: { cutout: "70%", plugins: { legend: { position: "bottom" } } },
  });
}

const stackedScales = {
  x: { stacked: true },
  y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
};

export type ChartBuilder = (d: Metrics) => ChartConfiguration;

export const signupsChart: ChartBuilder = (d) =>
  lineSeries(d.registrations.signups.labels, [
    { label: "Sign-ups", data: d.registrations.signups.values, color: css("--s1"), fill: true },
  ]);

export const revenueChart: ChartBuilder = (d) => {
  const { revenue, sales } = d.sales.series;
  return asConfig({
    type: "bar",
    data: {
      labels: revenue.labels.map(shortDate),
      datasets: [
        { type: "bar", label: "Gross sales (ZAR)", data: revenue.values, backgroundColor: css("--s1"), borderRadius: 2, yAxisID: "y", order: 2 },
        { type: "line", label: "Sales", data: sales.values, borderColor: css("--s3"), backgroundColor: css("--s3"), tension: 0.25, pointRadius: 2, borderWidth: 1.75, yAxisID: "y1", order: 1 },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v: number | string) => zar(Number(v)) } },
        y1: { beginAtZero: true, position: "right", grid: { display: false }, ticks: { precision: 0 } },
      },
    },
  });
};

export const productsChart: ChartBuilder = (d) => {
  const products = Object.entries(d.sales.by_product);
  return doughnut(products.map(([key]) => productName(key)), products.map(([, v]) => v.revenue_zar), "No sales yet");
};

export const statementsChart: ChartBuilder = (d) => {
  const { uploaded, processed, failed } = d.statements.series;
  return asConfig({
    type: "bar",
    data: {
      labels: uploaded.labels.map(shortDate),
      datasets: [
        { label: "Processed", data: processed.values, backgroundColor: css("--s1"), stack: "s", borderRadius: 2 },
        { label: "Failed", data: failed.values, backgroundColor: css("--s5"), stack: "s", borderRadius: 2 },
      ],
    },
    options: { scales: stackedScales },
  });
};

export const methodsChart: ChartBuilder = (d) => {
  const methods = Object.entries(d.statements.extraction_methods);
  return doughnut(methods.map(([key]) => key), methods.map(([, v]) => v), "None yet");
};

export const aiCallsChart: ChartBuilder = (d) => {
  const { labels, calls_by_feature } = d.ai.series;
  const colours = palette();
  return asConfig({
    type: "bar",
    data: {
      labels: labels.map(shortDate),
      datasets: calls_by_feature.length
        ? calls_by_feature.map((f, i) => ({
            label: f.label,
            data: f.values,
            backgroundColor: colours[i % colours.length],
            stack: "a",
            borderRadius: 2,
          }))
        : [{ label: "No calls", data: labels.map(() => 0), backgroundColor: css("--s6") }],
    },
    options: { scales: stackedScales },
  });
};

export const aiTokensChart: ChartBuilder = (d) =>
  doughnut(d.ai.by_feature.map((f) => f.label), d.ai.by_feature.map((f) => f.tokens), "No usage yet");

export const funnelChart: ChartBuilder = (d) => {
  const values = d.funnel.map((f) => f.count);
  return asConfig({
    type: "bar",
    data: {
      labels: d.funnel.map((f) => f.stage),
      datasets: [{ label: "Users", data: values, backgroundColor: css("--s2"), borderRadius: 2, barThickness: 18 }],
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx: { parsed: { x: number } }) => {
              const first = values[0] || 0;
              return first ? `${pct((ctx.parsed.x / first) * 100)} of accounts created` : "";
            },
          },
        },
      },
      scales: { x: { beginAtZero: true }, y: { grid: { display: false } } },
    },
  });
};

export const waitlistChart: ChartBuilder = (d) => {
  const { cumulative, series } = d.waitlist;
  return lineSeries(cumulative.labels, [
    { label: "Total", data: cumulative.values, color: css("--s1"), fill: false },
    { label: "Added that day", data: series.values, color: css("--s3"), fill: false },
  ]);
};

export const interestsChart: ChartBuilder = (d) => {
  const interests = Object.entries(d.waitlist.interests).sort((a, b) => b[1] - a[1]);
  return asConfig({
    type: "bar",
    data: {
      labels: interests.length ? interests.map(([key]) => capitalise(key)) : ["No sign-ups yet"],
      datasets: [
        {
          label: "People",
          data: interests.length ? interests.map(([, v]) => v) : [0],
          backgroundColor: css("--s4"),
          borderRadius: 2,
          barThickness: 22,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } },
    },
  });
};
