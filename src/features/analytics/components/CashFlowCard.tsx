import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { useNarrowScreen } from "../../../shared/hooks/useNarrowScreen";
import { groupByMonth, groupByWeek, type ChartDataPoint } from "../../overview/overviewUtils";
import CashFlowChart from "../../overview/components/CashFlowChart";
import { CashFlowLegend } from "../../overview/components/CashFlowLegend";
import { ChartCard } from "./ChartCard";
import { ChartDetails, DetailsTable, type DetailsColumn } from "./DetailsTable";
import { signedWith } from "./chartTheme";
import { Legend } from "./Legend";

/** The height the Overview's chart draws itself at; the card holds exactly that, so nothing scrolls inside it. */
const CHART_HEIGHT = 280;

/** What a month leaves: income (withdrawals included) less spending and gross deposits — the chart tooltip's own sum. */
const leftOf = (p: ChartDataPoint) => p.income - p.expenses - p.investments - p.goals;

/**
 * The Overview's «Ταμειακή ροή», here too: income, spending, investing and
 * goals side by side per month (per week for a single month), over the page's
 * range. The very chart and the very grouping the Overview uses
 * (`groupByMonth` / `groupByWeek`), so the two screens draw the same bars.
 */
export function CashFlowCard({ transactions, from, now, single, formatCurrency, noData, fixed }: { transactions: Transaction[]; from: Date | null; now: Date; single: boolean; formatCurrency: (n: number) => string; noData: string; /** This month's fixed income and bills — see `useFixedMonth`. Drawn only over months, not weeks. */ fixed?: { income: number; bills: number } }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const narrow = useNarrowScreen();

  const data = useMemo(() => {
    if (single && from) return groupByWeek(transactions, { start: from, end: now }, (n) => `${t("common.week", { defaultValue: "Week" })} ${n}`);
    const fmt = new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit" });
    return groupByMonth(transactions, (d) => fmt.format(d));
  }, [transactions, single, from, now, t, lang]);

  const signed = signedWith(formatCurrency);
  const marks = !single && fixed && (fixed.income > 0 || fixed.bills > 0) ? fixed : undefined;
  const fixedLegend = marks ? (
    <Legend
      items={[
        ...(marks.income > 0 ? [{ color: "var(--color-income)", label: t("analytics.fixed.incomeLine", { amount: formatCurrency(marks.income) }) }] : []),
        ...(marks.bills > 0 ? [{ color: "var(--color-expense)", label: t("analytics.fixed.billsLine", { amount: formatCurrency(marks.bills) }) }] : []),
      ]}
    />
  ) : null;
  const sum = (pick: (p: ChartDataPoint) => number) => Math.round(data.reduce((s, p) => s + pick(p), 0) * 100) / 100;
  const left = sum(leftOf);

  const columns: DetailsColumn<ChartDataPoint>[] = [
    { key: "when", label: single ? t("analytics.twoWay.week") : t("analytics.details.month"), cell: (r) => r.label },
    { key: "income", label: t("overview.income"), numeric: true, cell: (r) => formatCurrency(r.income), foot: formatCurrency(sum((p) => p.income)) },
    { key: "expenses", label: t("overview.expenses"), numeric: true, cell: (r) => formatCurrency(r.expenses), foot: formatCurrency(sum((p) => p.expenses)) },
    { key: "investments", label: t("overview.invested"), numeric: true, secondary: true, cell: (r) => formatCurrency(r.investments), foot: formatCurrency(sum((p) => p.investments)) },
    { key: "goals", label: t("overview.goals"), numeric: true, secondary: true, cell: (r) => formatCurrency(r.goals), foot: formatCurrency(sum((p) => p.goals)) },
    { key: "left", label: t("overview.moneyLeft"), numeric: true, tone: leftOf, cell: (r) => signed(leftOf(r)), foot: signed(left) },
  ];

  return (
    <ChartCard
      wide
      height={CHART_HEIGHT}
      title={t("overview.cashFlow")}
      hint={single ? t("overview.weeklyBreakdown") : t("overview.monthlyBreakdown")}
      value={data.length === 0 ? undefined : signed(left)}
      valueTone={left > 0 ? "income" : left < 0 ? "expense" : "neutral"}
      empty={data.length === 0 ? noData : undefined}
      footer={
        <div className="mt-2">
          <CashFlowLegend />
          {fixedLegend}
        </div>
      }
      details={{
        content: (
          <ChartDetails
            note={t("analytics.cashFlow.note")}
            chart={<CashFlowChart data={data} formatCurrency={formatCurrency} fixed={marks} />}
            legend={
              <>
                <CashFlowLegend />
                {fixedLegend}
              </>
            }
            tableTitle={t("analytics.details.table")}
            table={<DetailsTable rows={[...data].reverse()} rowKey={(r) => r.label} columns={columns} footLabel={t("common.total")} />}
          />
        ),
      }}
    >
      <CashFlowChart data={data} formatCurrency={formatCurrency} compact={narrow} fixed={marks} />
    </ChartCard>
  );
}
