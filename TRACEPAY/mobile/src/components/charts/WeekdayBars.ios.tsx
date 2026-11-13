import { Chart, Host } from "@expo/ui/swift-ui";

import type { WeekdayAverage } from "../../features/insights/insights-analytics";

type Props = {
  days: WeekdayAverage[];
  colors: { days: string[] };
  height?: number;
};

/** Swift Charts bars: average spend for each day of the week, one solid colour per weekday. */
export function WeekdayBars({ days, colors, height = 150 }: Props) {
  return (
    <Host style={{ height }}>
      <Chart
        type="bar"
        animate
        data={days.map((day) => ({
          x: day.label,
          y: Math.round(day.average),
          color: colors.days[day.weekday % colors.days.length],
        }))}
        barStyle={{ cornerRadius: 6 }}
        showGrid
      />
    </Host>
  );
}
