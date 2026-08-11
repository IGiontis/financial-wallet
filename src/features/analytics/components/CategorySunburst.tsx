import { useMemo } from "react";
import type { CategoryBranch } from "../analyticsUtils";
import { EChart } from "./EChart";
import { tooltipStyle, useChartPalette, withAlpha } from "./useChartPalette";

interface SunburstParams {
  name?: string;
  value?: number;
  treePathInfo?: { name: string; value: number }[];
}

/**
 * Two rings: spending categories inside, the payees inside each of them
 * outside. Clicking a category zooms into it and clicking the middle comes back
 * out, which is the part a flat chart can't offer — "€600 on groceries" and
 * "€380 of that at one shop" are different questions.
 */
export default function CategorySunburst({
  branches,
  labelFor,
  otherLabel,
  formatCurrency,
  ariaLabel,
}: {
  branches: CategoryBranch[];
  labelFor: (categoryId: string) => string;
  otherLabel: string;
  formatCurrency: (n: number) => string;
  ariaLabel: string;
}) {
  const palette = useChartPalette();

  const option = useMemo(() => {
    const data = branches.map((branch, i) => {
      const accent = palette.accents[i % palette.accents.length];
      return {
        name: labelFor(branch.categoryId),
        value: branch.value,
        itemStyle: { color: accent },
        children: branch.children.map((child, j) => ({
          name: child.name === "__other__" ? otherLabel : child.name,
          value: child.value,
          // Same hue, stepping paler outward, so a slice always reads as
          // belonging to the category it sits against.
          itemStyle: { color: withAlpha(accent, Math.max(0.78 - j * 0.1, 0.28)) },
        })),
      };
    });

    // A halo instead of a fixed light-or-dark label colour: the fills range from
    // saturated accents to near-transparent, and no single text colour survives
    // both ends of that in both themes.
    const label = {
      color: palette.text,
      textBorderColor: palette.surface,
      textBorderWidth: 2.5,
      minAngle: 14,
    };

    return {
      tooltip: {
        trigger: "item" as const,
        ...tooltipStyle(palette),
        formatter: (params: SunburstParams) => {
          const path = params.treePathInfo?.slice(1).map((p) => p.name) ?? [];
          const heading = path.length > 1 ? `${path[0]} › ${path[path.length - 1]}` : (params.name ?? "");
          return `${heading}<br/><b>${formatCurrency(params.value ?? 0)}</b>`;
        },
      },
      series: [
        {
          type: "sunburst" as const,
          data,
          radius: [0, "92%"],
          center: ["50%", "50%"],
          // null keeps our own ranking; ECharts would otherwise re-sort and the
          // rings would stop lining up with every other chart on the page.
          sort: null,
          emphasis: { focus: "ancestor" as const },
          itemStyle: { borderColor: palette.surface, borderWidth: 1.5 },
          levels: [
            {},
            { r0: "14%", r: "56%", label: { ...label, rotate: "tangential" as const, fontSize: 10 } },
            { r0: "57%", r: "90%", label: { ...label, fontSize: 9, minAngle: 12 } },
          ],
        },
      ],
    };
  }, [branches, labelFor, otherLabel, formatCurrency, palette]);

  return <EChart option={option} ariaLabel={ariaLabel} />;
}
