import type { ReviewColors } from "./reviewPalettes";

export function GridCell({ label, value, fullWidth = false, accent }: { label: string; value: string; fullWidth?: boolean; accent?: string }) {
  return (
    <div
      style={{
        gridColumn: fullWidth ? "1 / -1" : undefined,
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: 8,
        padding: "8px 10px",
        background: "var(--color-surface)",
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-text-secondary)", margin: "0 0 3px" }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: accent ?? "var(--color-text-primary)", margin: 0 }}>{value}</p>
    </div>
  );
}

export function SectionHead({ label }: { label: string }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-secondary)", margin: "12px 0 6px" }}>{label}</p>
  );
}

export interface FuelCell {
  label: string;
  value: string;
}

export interface TransactionReviewBodyProps {
  subtitle: string;
  description: string;
  categoryIcon: string;
  categoryName: string;
  primaryBadge: string;
  secondaryBadge?: string;
  colors: ReviewColors;
  amount: number;
  formatAmount: (n: number) => string;
  dateFormatted: string;
  notes?: string;
  fuelCells?: FuelCell[];
  hideCategoryLabel?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
}

export function TransactionReviewBody({
  subtitle,
  description,
  categoryIcon,
  categoryName,
  primaryBadge,
  secondaryBadge,
  colors,
  amount,
  formatAmount,
  dateFormatted,
  notes,
  fuelCells,
  hideCategoryLabel = false,
  gradientFrom,
  gradientTo,
}: TransactionReviewBodyProps) {
  const hasGradient = !!(gradientFrom && gradientTo);

  const heroBorderStyle = hasGradient
    ? {
        background: `linear-gradient(var(--color-surface), var(--color-surface)) padding-box, linear-gradient(135deg, ${gradientFrom}, ${gradientTo}) border-box`,
        border: "2px solid transparent",
      }
    : {
        border: `2px solid ${colors.cardBorder}`,
      };

  const heroInnerBg = hasGradient ? `linear-gradient(135deg, ${gradientFrom}22, ${gradientTo}18)` : colors.heroBg;


  return (
    <>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>{subtitle}</p>

      <div
        style={{
          ...heroBorderStyle,
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            background: heroInnerBg,
            borderBottom: hasGradient ? `1px solid transparent` : `1px solid ${colors.heroBorder}`,
            backgroundImage: hasGradient ? `linear-gradient(135deg, ${gradientFrom}22, ${gradientTo}18)` : undefined,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: colors.nameTxt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{description}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              {!hideCategoryLabel && (
                <span style={{ fontSize: 12, color: colors.subTxt }}>
                  {categoryIcon} {categoryName}
                </span>
              )}
              <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 20, background: colors.badgeBg, color: colors.badgeTxt }}>{primaryBadge}</span>
              {secondaryBadge && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 7px",
                    borderRadius: 20,
                    background: secondaryBadge === "Deposit" ? "color-mix(in srgb, var(--color-expense) 16%, transparent)" : "color-mix(in srgb, var(--color-income) 16%, transparent)",
                    color: secondaryBadge === "Deposit" ? "var(--color-expense)" : "var(--color-income)",
                  }}
                >
                  {secondaryBadge}
                </span>
              )}
            </div>
          </div>
          <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: colors.amtTxt, flexShrink: 0 }}>
            {colors.sign}
            {formatAmount(amount)}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <GridCell label="Date" value={dateFormatted} />
        <GridCell label="Category" value={`${categoryIcon} ${categoryName}`} />
        <GridCell label="Amount" value={formatAmount(amount)} accent={colors.amtTxt} />
        <GridCell label="Type" value={primaryBadge} accent={colors.amtTxt} />
        {notes && <GridCell label="Notes" value={notes} fullWidth />}
      </div>

      {fuelCells && fuelCells.length > 0 && (
        <>
          <SectionHead label="Fuel details" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {fuelCells.map((cell) => (
              <GridCell key={cell.label} label={cell.label} value={cell.value} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
