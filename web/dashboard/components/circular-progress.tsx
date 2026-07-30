"use client";

import { RadialBar, RadialBarChart } from "recharts";

/** Radial gauge for the health score widget -- same value/max/center-label
 * shape as the mobile app's CircularProgress component.
 *
 * The static track is a plain circle layered underneath (it's decorative,
 * not data -- RadialBar's own `background` prop shares the chart's angle
 * range with the data arc, which would shrink the track along with the
 * value instead of always showing a full circle). recharts draws the
 * animated progress arc on top via a single-item RadialBarChart, with the
 * percentage encoded as the chart's own angle sweep rather than as an axis
 * domain (RadialBar's length is relative to other data points, not an
 * absolute percentage of a fixed range).
 *
 * isAnimationActive is off: recharts' entrance animation for arc shapes
 * depends on an animation-frame tick to compute its path, which some
 * non-compositing/background render contexts never deliver, leaving the
 * arc permanently empty. Disabling it removes that dependency entirely. */
export function CircularProgress({
    value,
    max,
    size = 112,
    strokeWidth = 9,
    color = "currentColor",
    trackColor = "rgba(148, 163, 184, 0.25)",
    label,
    sublabel,
}: {
    value: number;
    max: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    trackColor?: string;
    label?: string;
    sublabel?: string;
}) {
    const progress = Math.max(0, Math.min(value / max, 1));
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const data = [{ value: 100 }];
    const labelSize = Math.round(size * 0.26);
    const sublabelSize = Math.max(9, Math.round(size * 0.1));

    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="absolute inset-0">
                <circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="transparent" />
            </svg>
            <RadialBarChart
                width={size}
                height={size}
                data={data}
                startAngle={90}
                endAngle={90 - progress * 360}
                innerRadius={radius - strokeWidth / 2}
                outerRadius={radius + strokeWidth / 2}
                barSize={strokeWidth}
                className="absolute inset-0"
            >
                <RadialBar dataKey="value" fill={color} cornerRadius={999} isAnimationActive={false} />
            </RadialBarChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                {label && (
                    <span className="font-bold text-foreground" style={{ fontSize: labelSize, lineHeight: `${labelSize + 2}px` }}>
                        {label}
                    </span>
                )}
                {sublabel && (
                    <span
                        className="mt-0.5 font-semibold uppercase tracking-wide text-muted-foreground"
                        style={{ fontSize: sublabelSize, lineHeight: `${sublabelSize + 2}px` }}
                    >
                        {sublabel}
                    </span>
                )}
            </div>
        </div>
    );
}
