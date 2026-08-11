import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { useTranslation } from "react-i18next";
import { TooltipRow, TooltipShell } from "./TooltipShell";
import styles from "./css/Analytics.module.css";

export interface PayeeDatum {
  name: string;
  value: number;
  count: number;
  /** Rank, 0 = biggest. Drives the tile's shade. */
  rank: number;
  total: number;
  /** recharts' `TreemapDataType` is an open record — this satisfies it. */
  [key: string]: unknown;
}

/** One hue, fading with rank — the tiles are already ordered, so colour only
 *  has to reinforce that, not encode a second dimension. */
const shade = (rank: number) => Math.max(0.9 - rank * 0.075, 0.22);

interface TileProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  rank?: number;
  depth?: number;
}

function Tile({ x = 0, y = 0, width = 0, height = 0, name = "", rank = 0, depth = 1 }: TileProps) {
  // recharts hands the root node to `content` as well as the leaves. Painting
  // it would lay a solid tile behind everything — turning the gutters between
  // tiles blue and lifting every pale tile onto a dark backdrop.
  if (depth === 0) return <g />;

  const opacity = shade(rank);
  // Below roughly half strength the fill is too pale for white text.
  const textFill = opacity >= 0.5 ? "#fff" : "var(--color-text-primary)";

  // SVG text has no ellipsis, so trim to what the tile can actually hold.
  const maxChars = Math.floor((width - 12) / 6.2);
  const label = name.length > maxChars ? `${name.slice(0, Math.max(maxChars - 1, 1))}…` : name;
  const showLabel = width > 46 && height > 20 && maxChars >= 3;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill="var(--bs-primary)" fillOpacity={opacity} stroke="var(--color-surface)" strokeWidth={2} rx={3} />
      {showLabel && (
        <text x={x + 6} y={y + 15} className={styles.treemapLabel} style={{ fill: textFill }}>
          {label}
        </text>
      )}
    </g>
  );
}

function PayeeTooltip({ active, payload, formatCurrency }: { active?: boolean; payload?: { payload?: PayeeDatum }[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const node = payload?.[0]?.payload;
  if (!active || !node?.name) return null;

  const share = node.total > 0 ? Math.round((node.value / node.total) * 100) : 0;

  return (
    <TooltipShell title={node.name}>
      <TooltipRow color="var(--bs-primary)" label={t("analytics.payees.spent")} value={formatCurrency(node.value)} />
      <TooltipRow label={t("transactions.transactionCount", { count: node.count })} value={`${share}%`} />
    </TooltipShell>
  );
}

/**
 * Tile area is the amount, so the payees quietly draining the most money are
 * literally the biggest thing on screen. A ranked bar list hides that behind
 * comparison; a treemap doesn't.
 */
export default function PayeeTreemap({ data, formatCurrency }: { data: PayeeDatum[]; formatCurrency: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={200}>
      <Treemap data={data} dataKey="value" nameKey="name" aspectRatio={4 / 3} isAnimationActive={false} content={(node) => <Tile {...(node as TileProps)} />}>
        <Tooltip content={<PayeeTooltip formatCurrency={formatCurrency} />} />
      </Treemap>
    </ResponsiveContainer>
  );
}
