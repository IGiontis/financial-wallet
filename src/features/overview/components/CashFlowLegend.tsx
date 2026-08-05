import { useTranslation } from "react-i18next";
import { SERIES, cssVar } from "./cashFlowSeries";

/** Legend shown above the chart. Deliberately free of recharts so it paints
 * straight away, without waiting for the chart bundle to arrive. */
export function CashFlowLegend() {
  const { t } = useTranslation();
  return (
    <div className="d-flex gap-3 flex-wrap">
      {SERIES.map((s) => (
        <span key={s.key} className="d-flex align-items-center text-body-secondary" style={{ gap: 5, fontSize: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: cssVar(s.token), display: "inline-block" }} />
          {t(s.labelKey)}
        </span>
      ))}
    </div>
  );
}
