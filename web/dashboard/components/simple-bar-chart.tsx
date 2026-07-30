"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LucideIcon } from "lucide-react";

import { EmptyState, type EmptyStateTone } from "@/components/ui/empty-state";

export interface BarPoint {
    label: string;
    value: number;
}

/** Generic bar chart -- used for anything shaped as a label/value series
 * (a trend over time, or a breakdown by category/region). */
export function SimpleBarChart({
    points,
    valueLabel = "Value",
    valueSuffix = "",
    domainMax,
    emptyIcon,
    emptyTone = "muted",
    emptyTitle = "No data yet",
    emptyDescription = "Nothing to show here yet.",
}: {
    points: BarPoint[];
    valueLabel?: string;
    valueSuffix?: string;
    domainMax?: number;
    emptyIcon?: LucideIcon;
    emptyTone?: EmptyStateTone;
    emptyTitle?: string;
    emptyDescription?: string;
}) {
    if (points.length === 0) {
        return <EmptyState icon={emptyIcon} tone={emptyTone} title={emptyTitle} description={emptyDescription} />;
    }

    return (
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs fill-muted-foreground" />
                <YAxis
                    domain={domainMax !== undefined ? [0, domainMax] : undefined}
                    tickLine={false}
                    axisLine={false}
                    className="text-xs fill-muted-foreground"
                    width={32}
                />
                <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                    }}
                    formatter={(value) => [`${value}${valueSuffix}`, valueLabel] as [string, string]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} className="fill-primary" maxBarSize={40} isAnimationActive={false} />
            </BarChart>
        </ResponsiveContainer>
    );
}
