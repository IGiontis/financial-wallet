import type { ReactNode } from "react";

// Presentational only — recharts clones whatever element it's handed and
// injects `active`/`payload`/`label`, so each chart wraps this in its own tiny
// tooltip component and passes what it needs (usually the currency formatter)
// as an ordinary prop.

export function TooltipShell({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--color-tooltip-bg)",
        color: "var(--color-tooltip-text)",
        borderRadius: "var(--border-radius-md)",
        padding: "10px 14px",
        minWidth: 150,
        boxShadow: "var(--shadow-lg)",
        pointerEvents: "none",
      }}
    >
      {title !== undefined && (
        <p className="text-uppercase fw-semibold mb-2" style={{ fontSize: 10.5, opacity: 0.6, letterSpacing: "0.08em" }}>
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

export function TooltipRow({ color, label, value }: { color?: string; label: ReactNode; value: ReactNode }) {
  return (
    <div className="d-flex justify-content-between align-items-center gap-3" style={{ marginBottom: 3 }}>
      <span className="d-flex align-items-center" style={{ fontSize: 12.5, opacity: 0.78, gap: 7, minWidth: 0 }}>
        {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />}
        <span className="text-truncate">{label}</span>
      </span>
      <span className="fw-semibold flex-shrink-0" style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}
