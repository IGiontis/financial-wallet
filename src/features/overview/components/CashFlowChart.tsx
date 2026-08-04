import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useTranslation } from "react-i18next";
import type { ChartDataPoint } from "../overviewUtils";

// ─── Series definition ────────────────────────────────────────────────────────
// Colours come from the token layer so the chart follows light/dark mode.

const SERIES = [
  { key: "income", token: "--color-income", labelKey: "overview.income" },
  { key: "expenses", token: "--color-expense", labelKey: "overview.expenses" },
  { key: "investments", token: "--color-invest", labelKey: "overview.invested" },
  { key: "goals", token: "--color-goal", labelKey: "overview.goals" },
] as const;

const cssVar = (name: string) => `var(${name})`;

// ─── Rounded bar shape ────────────────────────────────────────────────────────

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}

function RoundedBar({ x = 0, y = 0, width = 0, height = 0, fill }: BarShapeProps) {
  if (height <= 0 || width <= 0) return null;
  const r = Math.min(5, width / 2);
  return (
    <path
      d={`M${x + r},${y} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${height - r} h${-width} v${-(height - r)} a${r},${r} 0 0 1 ${r},${-r}z`}
      fill={fill}
    />
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipEntry {
  dataKey: string;
  value: number;
  payload?: ChartDataPoint;
}

function useTooltipRenderer(formatCurrency: (n: number) => string) {
  const { t } = useTranslation();

  return useMemo(() => {
    return function CashFlowTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
      if (!active || !payload?.length) return null;

      const valueOf = (key: string) => payload.find((p) => p.dataKey === key)?.value ?? 0;
      const income = valueOf("income");
      const expenses = valueOf("expenses");
      const investments = valueOf("investments");
      const goals = valueOf("goals");

      // Withdrawals are already folded into `income`, so subtract the GROSS
      // deposits here — using net figures would count a withdrawal twice.
      const moneyLeft = income - expenses - investments - goals;

      const rows = [
        { labelKey: "overview.income", value: income, token: "--color-income", always: true },
        { labelKey: "overview.expenses", value: expenses, token: "--color-expense", always: true },
        { labelKey: "overview.invested", value: investments, token: "--color-invest", always: false },
        { labelKey: "overview.goals", value: goals, token: "--color-goal", always: false },
      ];

      return (
        <div
          style={{
            background: "var(--color-tooltip-bg)",
            color: "var(--color-tooltip-text)",
            borderRadius: "var(--border-radius-md)",
            padding: "12px 16px",
            minWidth: 190,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <p className="text-uppercase fw-semibold mb-2" style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.08em" }}>
            {label}
          </p>

          {rows
            .filter((r) => r.always || r.value > 0)
            .map((r) => (
              <div key={r.labelKey} className="d-flex justify-content-between align-items-center mb-1" style={{ gap: 16 }}>
                <span className="d-flex align-items-center" style={{ fontSize: 13, opacity: 0.75, gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: cssVar(r.token), display: "inline-block" }} />
                  {t(r.labelKey)}
                </span>
                <span className="fw-semibold" style={{ fontSize: 13, color: cssVar(r.token) }}>
                  {formatCurrency(r.value)}
                </span>
              </div>
            ))}

          <div className="d-flex justify-content-between pt-2 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.15)", gap: 16 }}>
            <span style={{ fontSize: 13, opacity: 0.75 }}>{t("overview.moneyLeft")}</span>
            <span className="fw-bold" style={{ fontSize: 13, color: moneyLeft >= 0 ? "var(--color-income)" : "var(--color-expense)" }}>
              {moneyLeft >= 0 ? "+" : ""}
              {formatCurrency(moneyLeft)}
            </span>
          </div>
        </div>
      );
    };
  }, [formatCurrency, t]);
}

// ─── Chart ────────────────────────────────────────────────────────────────────

interface CashFlowChartProps {
  data: ChartDataPoint[];
  formatCurrency: (n: number) => string;
  /** Compact axis formatting for small screens. */
  compact?: boolean;
}

export function CashFlowChart({ data, formatCurrency, compact = false }: CashFlowChartProps) {
  const CustomTooltip = useTooltipRenderer(formatCurrency);

  return (
    <ResponsiveContainer width="100%" height={280} debounce={200}>
      <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barGap={3} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={(v: number) => (compact ? compactNumber(v) : formatCurrency(v))}
          tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
          axisLine={false}
          tickLine={false}
          width={compact ? 40 : 64}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(128,128,128,0.08)", radius: 4 }} />
        {SERIES.map((s) => (
          <Bar key={s.key} dataKey={s.key} maxBarSize={28} shape={<RoundedBar />}>
            {data.map((_, i) => (
              <Cell key={i} fill={cssVar(s.token)} fillOpacity={0.9} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 1200 → "1.2k" — keeps the Y axis narrow on phones. */
function compactNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(v);
}

/** Legend shown above the chart. */
export function CashFlowLegend() {
  const { t } = useTranslation();
  return (
    <div className="d-flex gap-3 flex-wrap">
      {SERIES.map((s) => (
        <span key={s.key} className="d-flex align-items-center text-body-secondary" style={{ gap: 5, fontSize: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: cssVar(s.token), display: "inline-block" }} />
          {t(s.labelKey)}
        </span>
      ))}
    </div>
  );
}
