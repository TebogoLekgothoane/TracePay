"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PartyPopper } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

export interface DonutSegment {
    label: string;
    value: number;
    color: string;
}

export function LeakBreakdownDonut({ segments }: { segments: DonutSegment[] }) {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);

    if (total <= 0) {
        return (
            <EmptyState
                icon={PartyPopper}
                tone="brand"
                title="No leaks detected"
                description="Nothing is leaking right now -- once we spot a pattern, its category breakdown shows up here."
            />
        );
    }

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative h-[160px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={segments}
                            dataKey="value"
                            nameKey="label"
                            innerRadius={48}
                            outerRadius={70}
                            paddingAngle={2}
                            strokeWidth={0}
                            isAnimationActive={false}
                        >
                            {segments.map((segment) => (
                                <Cell key={segment.label} fill={segment.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                            formatter={(value, name) => [`R${Number(value).toFixed(2)}/mo`, name] as [string, string]}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-foreground">R{total.toFixed(0)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Leaking / mo</span>
                </div>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {segments.map((segment) => (
                    <div key={segment.label} className="flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="text-muted-foreground">
                            {segment.label} · {Math.round((segment.value / total) * 100)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
