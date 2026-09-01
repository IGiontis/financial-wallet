import Skeleton from "react-loading-skeleton";

// Loading placeholders shaped like the thing that is coming.
//
// A centred spinner says "wait" and nothing else: the page jumps into a new
// layout the moment it resolves, and on a slow connection there is no clue
// whether two rows or forty are on the way. These stand in at roughly the right
// size, so the page settles instead of appearing.
//
// Colours come from `.react-loading-skeleton` in index.css, which is wired to
// the design tokens — nothing here passes a colour, and dark mode needs no
// special case.

/** A card outline matching the app's own: same radius, border and surface. */
export function SkeletonCard({ className = "", children, style }: { className?: string; children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className={`p-3 p-lg-4 ${className}`}
      style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", background: "var(--color-surface)", ...style }}
    >
      {children}
    </div>
  );
}

/** Heading plus a line of secondary text — the top of most cards. */
export function SkeletonHeading({ width = "40%", sub = true }: { width?: string | number; sub?: boolean }) {
  return (
    <div className="mb-3">
      <Skeleton height={18} width={width} />
      {sub && <Skeleton height={11} width="65%" style={{ marginTop: 4 }} />}
    </div>
  );
}

/** The page title block: a heading on the left, a control on the right. */
export function SkeletonPageHeader({ action = true }: { action?: boolean }) {
  return (
    <div className="d-flex justify-content-between align-items-start mb-3 gap-2">
      <div style={{ flex: 1, maxWidth: 320 }}>
        <Skeleton height={20} width="55%" />
        <Skeleton height={12} width="85%" style={{ marginTop: 4 }} />
      </div>
      {action && <Skeleton height={38} width={110} style={{ borderRadius: "var(--border-radius-md)" }} />}
    </div>
  );
}

/**
 * A list of rows: icon, two lines of text, a figure on the right.
 *
 * The shape almost every list in this app takes — bills, transactions,
 * contributions, goals.
 */
export function SkeletonRows({ count = 4, icon = true }: { count?: number; icon?: boolean }) {
  return (
    <div className="d-flex flex-column gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="d-flex align-items-center gap-2">
          {icon && <Skeleton circle height={34} width={34} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton height={13} width={`${55 + ((i * 13) % 30)}%`} />
            <Skeleton height={10} width="35%" style={{ marginTop: 3 }} />
          </div>
          <Skeleton height={14} width={64} />
        </div>
      ))}
    </div>
  );
}

/** A card whose body is a chart: heading, then one tall block. */
export function SkeletonChartCard({ height = 220, className = "" }: { height?: number; className?: string }) {
  return (
    <SkeletonCard className={className}>
      <SkeletonHeading />
      <Skeleton height={height} style={{ borderRadius: "var(--border-radius-md)" }} />
    </SkeletonCard>
  );
}

/** A row of small figure tiles, as the summary strips use. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="row g-2 g-lg-3 mb-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="col-6 col-lg-3">
          <SkeletonCard className="p-3">
            <Skeleton height={10} width="60%" />
            <Skeleton height={22} width="80%" style={{ marginTop: 6 }} />
          </SkeletonCard>
        </div>
      ))}
    </div>
  );
}

/** Cards in a responsive grid — the goals and investments boards. */
export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="row g-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="col-12 col-md-6 col-xl-4">
          <SkeletonCard>
            <div className="d-flex align-items-center gap-2 mb-3">
              <Skeleton circle height={36} width={36} />
              <div style={{ flex: 1 }}>
                <Skeleton height={14} width="70%" />
                <Skeleton height={10} width="45%" style={{ marginTop: 4 }} />
              </div>
            </div>
            <Skeleton height={8} style={{ borderRadius: 4 }} />
            <div className="d-flex justify-content-between mt-3">
              <Skeleton height={12} width={70} />
              <Skeleton height={12} width={70} />
            </div>
          </SkeletonCard>
        </div>
      ))}
    </div>
  );
}

export { Skeleton };
