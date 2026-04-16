// ─── Colors ───────────────────────────────────────────────────────────────────

export const EXPENSE_COLORS = {
  cardBorder: "#EF4444",
  heroBg: "#FFF5F5",
  heroBorder: "#FED7D7",
  iconBg: "#FEE2E2",
  nameTxt: "#7F1D1D",
  subTxt: "#B91C1C",
  badgeBg: "#FEE2E2",
  badgeTxt: "#991B1B",
  amtTxt: "#B91C1C",
  sign: "−",
};

export const INCOME_COLORS = {
  cardBorder: "#10B981",
  heroBg: "#F0FDF4",
  heroBorder: "#BBF7D0",
  iconBg: "#DCFCE7",
  nameTxt: "#14532D",
  subTxt: "#15803D",
  badgeBg: "#DCFCE7",
  badgeTxt: "#166534",
  amtTxt: "#15803D",
  sign: "+",
};

export type ReviewColors = typeof EXPENSE_COLORS;

// ─── Primitives ───────────────────────────────────────────────────────────────

export function GridCell({ label, value, fullWidth = false, accent }: { label: string; value: string; fullWidth?: boolean; accent?: string }) {
  return (
    <div style={{ gridColumn: fullWidth ? "1 / -1" : undefined, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#4a4f57", margin: "0 0 3px" }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: accent ?? "#1e293b", margin: 0 }}>{value}</p>
    </div>
  );
}

export function SectionHead({ label }: { label: string }) {
  return <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", margin: "12px 0 6px" }}>{label}</p>;
}

// ─── Shared layout ────────────────────────────────────────────────────────────

export interface FuelCell {
  label: string;
  value: string;
}

export interface TransactionReviewBodyProps {
  subtitle: string;
  icon: string;
  description: string;
  categoryIcon: string;
  categoryName: string;
  primaryBadge: string; // "Income" | "Expense" | "Goal" | "Investment"
  secondaryBadge?: string; // "Withdrawal" | "Deposit" — only for goal/investment
  colors: ReviewColors;
  amount: number;
  formatAmount: (n: number) => string;
  dateFormatted: string; // already formatted dd/MM/yyyy
  notes?: string;
  fuelCells?: FuelCell[];
}

export function TransactionReviewBody({
  subtitle,
  icon,
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
}: TransactionReviewBodyProps) {
  return (
    <>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: "1rem" }}>{subtitle}</p>

      {/* Hero */}
      <div style={{ border: `2px solid ${colors.cardBorder}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ background: colors.heroBg, borderBottom: `1px solid ${colors.heroBorder}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: colors.iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: colors.nameTxt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{description}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 12, color: colors.subTxt }}>
                {categoryIcon} {categoryName}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 20, background: colors.badgeBg, color: colors.badgeTxt }}>{primaryBadge}</span>
              {secondaryBadge && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 20, background: colors.badgeBg, color: colors.badgeTxt }}>{secondaryBadge}</span>
              )}
            </div>
          </div>
          <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: colors.amtTxt, flexShrink: 0 }}>
            {colors.sign}
            {formatAmount(amount)}
          </p>
        </div>
      </div>

      {/* Base grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <GridCell label="Date" value={dateFormatted} />
        <GridCell label="Category" value={`${categoryIcon} ${categoryName}`} />
        <GridCell label="Amount" value={formatAmount(amount)} accent={colors.amtTxt} />
        <GridCell label="Type" value={primaryBadge} accent={colors.amtTxt} />
        {notes && <GridCell label="Notes" value={notes} fullWidth />}
      </div>

      {/* Fuel details */}
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
