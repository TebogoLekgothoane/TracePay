import { Chart, Host } from "@expo/ui/swift-ui";

import type { WeekdayAverage } from "../../features/insights/insights-analytics";

type Props = {
  days: WeekdayAverage[];
  colors: { bar: string; highlight: string };
  height?: number;
};

/** Swift Charts bars: average spend for each day of the week, heaviest day emphasised. */
export function WeekdayBars({ days, colors, height = 150 }: Props) {
  const top = days.reduce((best, day) => (day.average > best.average ? day : best), days[0]);
  return (
    <Host style={{ height }}>
      <Chart
        type="bar"
        animate
        data={days.map((day) => ({
          x: day.label,
          y: Math.round(day.average),
          color: day.weekday === top.weekday && day.average > 0 ? colors.highlight : colors.bar,
        }))}
        barStyle={{ cornerRadius: 6 }}
        showGrid
      />
    </Host>
  );
}
