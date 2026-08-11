import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { DistributionRow } from "../analyticsUtils";
import { compactNumber } from "./chartTheme";
import { EChart } from "./EChart";
import { tooltipStyle, useChartPalette, withAlpha } from "./useChartPalette";

interface BoxParams {
  seriesType?: string;
  dataIndex?: number;
  value?: (number | string)[];
}

/**
 * A five-number summary per category: the box spans the middle half of your
 * payments, the line inside is the typical one, and the whiskers reach the
 * ordinary extremes. Dots past them are the genuine one-offs.
 *
 * This is the chart a total-per-category bar cannot be: €600 of groceries from
 * forty €15 shops and €600 from one delivery look identical as a bar, and
 * completely different here.
 */
export default function CategoryBoxplot({
  rows,
  labelFor,
  formatCurrency,
  ariaLabel,
}: {
  rows: DistributionRow[];
  labelFor: (categoryId: string) => string;
  formatCurrency: (n: number) => string;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const palette = useChartPalette();

  const option = useMemo(() => {
    // Reversed: a category axis runs bottom-up, and the biggest spender should
    // read first, at the top.
    const ordered = [...rows].reverse();
    const axisLabels = ordered.map((r) => labelFor(r.categoryId));

    return {
      grid: { left: 2, right: 10, top: 6, bottom: 2, containLabel: true },
      xAxis: {
        type: "value" as const,
        axisLabel: { formatter: (v: number) => compactNumber(v), color: palette.textSecondary, fontSize: 10 },
        splitLine: { lineStyle: { color: palette.border, type: "dashed" as const } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: "category" as const,
        data: axisLabels,
        axisLabel: { color: palette.textSecondary, fontSize: 10, width: 78, overflow: "truncate" as const },
        axisLine: { lineStyle: { color: palette.border } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      tooltip: {
        trigger: "item" as const,
        ...tooltipStyle(palette),
        formatter: (params: BoxParams) => {
          const index = params.dataIndex ?? 0;
          const row = ordered[index];

          if (params.seriesType === "scatter") {
            const amount = Number(params.value?.[0] ?? 0);
            return `${labelFor(row.categoryId)}<br/>${t("analytics.boxplot.outlier")}: <b>${formatCurrency(amount)}</b>`;
          }

          return [
            `${labelFor(row.categoryId)} · ${t("transactions.transactionCount", { count: row.count })}`,
            `${t("analytics.boxplot.median")}: <b>${formatCurrency(row.median)}</b>`,
            `${t("analytics.boxplot.middleHalf")}: ${formatCurrency(row.q1)} – ${formatCurrency(row.q3)}`,
            `${t("analytics.boxplot.usualRange")}: ${formatCurrency(row.low)} – ${formatCurrency(row.high)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "boxplot" as const,
          data: ordered.map((r) => [r.low, r.q1, r.median, r.q3, r.high]),
          boxWidth: [8, 24] as [number, number],
          itemStyle: { color: withAlpha(palette.primary, 0.22), borderColor: palette.primary, borderWidth: 1.5 },
          emphasis: { itemStyle: { borderWidth: 2, color: withAlpha(palette.primary, 0.35) } },
        },
        {
          type: "scatter" as const,
          data: ordered.flatMap((r, i) => r.outliers.map((v) => [v, i])),
          symbolSize: 5,
          itemStyle: { color: palette.expense, opacity: 0.65 },
        },
      ],
    };
  }, [rows, labelFor, formatCurrency, palette, t]);

  return <EChart option={option} ariaLabel={ariaLabel} />;
}
