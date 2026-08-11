import { useMemo } from "react";
import { FLOW_DEFICIT_ID, type FlowLink, type FlowNode } from "../analyticsUtils";
import { EChart } from "./EChart";
import { tooltipStyle, useChartPalette, withAlpha } from "./useChartPalette";

interface SankeyParams {
  dataType?: string;
  name?: string;
  value?: number;
  data?: { source?: string; target?: string };
}

/**
 * Every euro that came in and where it ended up, in one picture: sources on the
 * left, a single hub, then spending, savings and what was left on the right.
 *
 * Ribbon thickness is the amount, so the diagram makes the proportions
 * impossible to misjudge — the thing a stack of separate totals never does.
 *
 * Labels sit in the gaps *between* columns rather than outside them, with a
 * halo in the card colour. Outside labels would need ~200px of margin the card
 * doesn't have on a phone, and would still be clipped.
 */
export default function MoneyFlowSankey({
  nodes,
  links,
  labelFor,
  formatCurrency,
  ariaLabel,
}: {
  nodes: FlowNode[];
  links: FlowLink[];
  labelFor: (node: FlowNode) => string;
  formatCurrency: (n: number) => string;
  ariaLabel: string;
}) {
  const palette = useChartPalette();

  const option = useMemo(() => {
    const labels = new Map(nodes.map((n) => [n.id, labelFor(n)]));

    const colorFor = (node: FlowNode) => {
      // A shortfall enters on the income side but is not good news, so it keeps
      // the expense colour rather than blending in with real income.
      if (node.id === FLOW_DEFICIT_ID) return palette.expense;
      switch (node.kind) {
        case "income":
          return palette.income;
        case "hub":
          return palette.primary;
        case "expense":
          return palette.expense;
        case "savings":
          return palette.invest;
        default:
          return palette.goal;
      }
    };

    const labelBase = {
      color: palette.text,
      fontSize: 10.5,
      textBorderColor: palette.surface,
      textBorderWidth: 3,
      overflow: "truncate" as const,
      width: 96,
    };

    return {
      tooltip: {
        trigger: "item" as const,
        ...tooltipStyle(palette),
        formatter: (params: SankeyParams) => {
          const value = formatCurrency(params.value ?? 0);
          if (params.dataType === "edge") {
            const from = labels.get(params.data?.source ?? "") ?? "";
            const to = labels.get(params.data?.target ?? "") ?? "";
            return `${from} → ${to}<br/><b>${value}</b>`;
          }
          return `${labels.get(params.name ?? "") ?? ""}<br/><b>${value}</b>`;
        },
      },
      series: [
        {
          type: "sankey" as const,
          left: 6,
          right: 6,
          top: 10,
          bottom: 10,
          nodeWidth: 10,
          nodeGap: 9,
          nodeAlign: "justify" as const,
          draggable: false,
          emphasis: { focus: "adjacency" as const },
          data: nodes.map((node) => ({
            name: node.id,
            itemStyle: { color: colorFor(node), borderWidth: 0 },
            label: {
              ...labelBase,
              // Sources read rightwards into the gap, sinks leftwards into it,
              // and the hub sits above its own bar. Nothing leaves the box.
              position: node.kind === "income" ? ("right" as const) : node.kind === "hub" ? ("top" as const) : ("left" as const),
              formatter: () => labels.get(node.id) ?? "",
            },
          })),
          links: links.map((link) => ({ source: link.source, target: link.target, value: link.value })),
          lineStyle: { color: "gradient" as const, opacity: 0.32, curveness: 0.5 },
          itemStyle: { borderWidth: 0 },
          select: { itemStyle: { color: withAlpha(palette.primary, 0.9) } },
        },
      ],
    };
  }, [nodes, links, labelFor, formatCurrency, palette]);

  return <EChart option={option} ariaLabel={ariaLabel} />;
}
