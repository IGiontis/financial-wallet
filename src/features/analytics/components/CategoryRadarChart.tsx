import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslation } from "react-i18next";
import { GRID_STROKE } from "./chartTheme";
import { TooltipRow, TooltipShell } from "./TooltipShell";

interface Point {
  name: string;
  current: number;
  average: number;
}

function ProfileTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: Point }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const diff = point.current - point.average;

  return (
    <TooltipShell title={point.name}>
      <TooltipRow color="var(--bs-primary)" label={t("analytics.profile.current")} value={formatCurrency(point.current)} />
      <TooltipRow color="var(--color-text-secondary)" label={t("analytics.profile.average")} value={formatCurrency(point.average)} />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: 6, paddingTop: 6 }}>
        <TooltipRow label={t("analytics.profile.difference")} value={`${diff >= 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))}`} />
      </div>
    </TooltipShell>
  );
}

/**
 * The current month's shape laid over your usual one. Where the filled area
 * pushes past the outline you're running hot in that category this month; where
 * it tucks inside, you're under.
 */
export default function CategoryRadarChart({ data, formatCurrency }: { data: Point[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <PolarGrid stroke={GRID_STROKE} />
        {/* Category names sit right on the edge, so they get the smallest type
            on the page and are trimmed by the axis rather than wrapping. */}
        <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <Tooltip content={<ProfileTooltip formatCurrency={formatCurrency} />} />
        <Radar name={t("analytics.profile.average")} dataKey="average" stroke="var(--color-text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
        <Radar name={t("analytics.profile.current")} dataKey="current" stroke="var(--bs-primary)" strokeWidth={2} fill="var(--bs-primary)" fillOpacity={0.25} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
