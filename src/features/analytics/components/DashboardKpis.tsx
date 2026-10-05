import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { percentChange, type PeriodTotals } from "../dashboardUtils";
import styles from "./css/Dashboard.module.css";

// The four figures at the top of the page: what came in, what went out, what
// was kept, and that as a share — each with last year's same stretch beside it
// and its months drawn small underneath.

type Tone = "good" | "bad" | "quiet";

interface Tile {
  key: string;
  label: string;
  icon: string;
  color: string;
  value: string;
  delta: { text: string; tone: Tone };
  series: (number | null)[];
}

/** Up is good for income, kept money and the rate; for spending it is the bad way. */
const toneOf = (change: number, upIsGood: boolean): Tone => (change === 0 ? "quiet" : change > 0 === upIsGood ? "good" : "bad");
const arrow = (change: number) => (change > 0 ? "▲" : change < 0 ? "▼" : "•");

/**
 * A month-by-month line in a few pixels. Plain SVG rather than a chart: four
 * of them in the first screen are not worth four chart instances.
 */
function Sparkline({ values }: { values: (number | null)[] }) {
  const path = useMemo(() => {
    const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
    if (real.length < 2) return undefined;
    const min = Math.min(...real);
    const max = Math.max(...real);
    const span = max - min || 1;
    const step = values.length > 1 ? 100 / (values.length - 1) : 0;
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      const x = (i * step).toFixed(2);
      const y = (26 - ((v - min) / span) * 24).toFixed(2);
      d += `${pen ? "L" : "M"}${x} ${y} `;
      pen = true;
    });
    return d.trim();
  }, [values]);

  if (!path) return <span className={styles.kpiSpark} aria-hidden />;
  return (
    <svg className={styles.kpiSpark} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke="var(--kpi)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function DashboardKpis({
  current,
  lastYear,
  months,
  rangeLabel,
  formatCurrency,
  locale,
}: {
  current: PeriodTotals;
  /** Undefined when there is no comparable year before — see `hasLastYear`. */
  lastYear?: PeriodTotals;
  months: { income: number; expenses: number; net: number; rate: number | null }[];
  rangeLabel: string;
  formatCurrency: (n: number) => string;
  locale: string;
}) {
  const { t } = useTranslation();
  const one = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale]);

  const noComparison = { text: t("analytics.dashboard.noLastYear"), tone: "quiet" as Tone };
  const percent = (now: number, then: number | undefined, upIsGood: boolean) => {
    const change = then === undefined ? undefined : percentChange(now, then);
    if (change === undefined) return noComparison;
    return { text: t("analytics.dashboard.vsLastYear", { change: `${arrow(change)} ${one.format(Math.abs(change))}%` }), tone: toneOf(change, upIsGood) };
  };

  const netChange = lastYear ? Math.round((current.net - lastYear.net) * 100) / 100 : undefined;
  const rateChange = lastYear && current.rate !== undefined && lastYear.rate !== undefined ? Math.round((current.rate - lastYear.rate) * 10) / 10 : undefined;

  const tiles: Tile[] = [
    {
      key: "income",
      label: t("analytics.flow.income"),
      icon: "↓",
      color: "var(--chart-income)",
      value: formatCurrency(current.income),
      delta: percent(current.income, lastYear?.income, true),
      series: months.map((m) => m.income),
    },
    {
      key: "expenses",
      label: t("analytics.flow.expenses"),
      icon: "↑",
      color: "var(--chart-expense)",
      value: formatCurrency(current.expenses),
      delta: percent(current.expenses, lastYear?.expenses, false),
      series: months.map((m) => m.expenses),
    },
    {
      key: "net",
      label: t("analytics.flow.net"),
      icon: "Σ",
      color: "var(--chart-net)",
      value: formatCurrency(current.net),
      delta:
        netChange === undefined
          ? noComparison
          : { text: t("analytics.dashboard.vsLastYear", { change: `${arrow(netChange)} ${formatCurrency(Math.abs(netChange))}` }), tone: toneOf(netChange, true) },
      series: months.map((m) => m.net),
    },
    {
      key: "rate",
      label: t("analytics.savingsRate.rate"),
      icon: "%",
      color: "var(--color-goal)",
      value: current.rate === undefined ? "—" : `${one.format(current.rate)}%`,
      delta:
        rateChange === undefined
          ? noComparison
          : { text: t("analytics.dashboard.vsLastYear", { change: `${arrow(rateChange)} ${t("analytics.dashboard.points", { value: one.format(Math.abs(rateChange)) })}` }), tone: toneOf(rateChange, true) },
      series: months.map((m) => m.rate),
    },
  ];

  const toneClass: Record<Tone, string> = { good: styles.kpiGood, bad: styles.kpiBad, quiet: styles.kpiQuiet };

  return (
    <div className={styles.kpis}>
      {tiles.map((tile) => (
        <section key={tile.key} className={styles.kpi} style={{ ["--kpi" as string]: tile.color }} aria-label={`${tile.label} · ${rangeLabel}`}>
          <div className={styles.kpiTop}>
            <p className={styles.kpiLabel}>
              {tile.label} · {rangeLabel}
            </p>
            <span className={styles.kpiIcon} aria-hidden>
              {tile.icon}
            </span>
          </div>
          <p className={styles.kpiValue}>{tile.value}</p>
          <span className={`${styles.kpiDelta} ${toneClass[tile.delta.tone]}`}>{tile.delta.text}</span>
          <Sparkline values={tile.series} />
        </section>
      ))}
    </div>
  );
}
