import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, XAxis } from "recharts";
import { AXIS_TICK, GRID_STROKE } from "./chartTheme";

export interface NetBar {
  label: string;
  net: number;
  /** The month still under way, drawn faint: its bar will still move. */
  running: boolean;
}

/**
 * What each month kept, as one row of bars about a zero line — the glance
 * the "month by month" card gives. No scale, grid or tooltip: the card is a
 * way into the full figures, not where they are read, so the whole drawing
 * answers a tap by opening them (see `ChartCard`'s `details`).
 */
export default function MonthNetBars({ data }: { data: NetBar[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      {/* No accessibility layer: the card around it is the one control. */}
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} accessibilityLayer={false}>
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={4} interval="preserveStartEnd" minTickGap={10} />
        <ReferenceLine y={0} stroke={GRID_STROKE} />
        <Bar dataKey="net" maxBarSize={30} radius={3} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.label} fill={row.net >= 0 ? "var(--chart-income)" : "var(--chart-expense)"} fillOpacity={row.running ? 0.4 : 0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
