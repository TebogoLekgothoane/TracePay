"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

export interface TrendPoint {
    label: string;
    value: number;
}

/** Generic bar chart for label/value series (health score over time, health
 * score by region, redemptions per day, ...) -- shared so every dashboard
 * area gets the same look rather than each rolling its own. */
export function TrendBarChart({
    points,
    domain,
    valueLabel = "Value",
    formatValue = (value: number) => String(value),
    emptyIcon,
    emptyTitle = "No data yet",
    emptyDescription,
    height = 200,
}: {
    points: TrendPoint[];
    domain?: [number, number];
    valueLabel?: string;
    formatValue?: (value: number) => string;
    emptyIcon?: LucideIcon;
    emptyTitle?: string;
    emptyDescription: string;
    height?: number;
}) {
    if (points.length === 0) {
        return <EmptyState icon={emptyIcon} tone="muted" title={emptyTitle} description={emptyDescription} />;
    }

    // recharts v3.10.1's "auto" YAxis domain can silently drop a bar for
    // small integer datasets (reproduced: 3 categories with values 1-3, one
    // bar's <path> never renders) -- always resolve a real numeric domain
    // ourselves rather than relying on the "auto" keyword.
    const resolvedDomain: [number, number] =
        domain ?? [0, Math.max(1, Math.ceil(Math.max(...points.map((point) => point.value)) * 1.2))];

    return (
        <div className="flex h-[200px] items-center">
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs fill-muted-foreground" />
                    <YAxis
                        domain={resolvedDomain}
                        tickLine={false}
                        axisLine={false}
                        className="text-xs fill-muted-foreground"
                        width={40}
                    />
                    <Tooltip
                        cursor={{ fill: "hsl(var(--muted))" }}
                        contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                        formatter={(value) => [formatValue(Number(value)), valueLabel] as [string, string]}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} className="fill-primary" maxBarSize={40} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
