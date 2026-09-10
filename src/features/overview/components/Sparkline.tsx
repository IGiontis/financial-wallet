/**
 * The shape of a run of numbers, at the size of a line of text.
 *
 * Drawn by hand rather than with the chart library: this is fourteen points and
 * no axes, and pulling in recharts for it would cost more than the whole tile.
 * It carries no labels on purpose — the figure above it is the number, and this
 * only says which way it has been going.
 */
export function Sparkline({ values, tone, className, label }: { values: number[]; tone: string; className?: string; label: string }) {
  if (values.length < 2) return null;

  const width = 200;
  const height = 48;
  const low = Math.min(...values);
  const high = Math.max(...values);
  // A flat run would divide by zero and, worse, draw a line at the top of the
  // box as though it were a high. Flat belongs in the middle.
  const span = high - low || 1;
  const at = (value: number, index: number) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - low) / span) * (height - 4) - 2;
    return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
  };

  const points = values.map(at).join(" ");
  const area = `${at(values[0], 0)} ${points} ${width},${height} 0,${height}`;

  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polygon points={area} fill={tone} opacity="0.16" />
      <polyline points={points} fill="none" stroke={tone} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
