import { useEffect, useRef, type RefObject } from "react";
import { useCountUp } from "react-countup";
import { Card, CardBody } from "reactstrap";

interface MetricCardProps {
  label: string;
  value: number;
  color: string;
  isPercentage?: boolean;
  formatFn?: (n: number) => string;
}

/** A single headline figure (income, expenses, net…) shown on the dashboard. */
export function MetricCard({ label, value, color, isPercentage = false, formatFn }: MetricCardProps) {
  const spanRef = useRef<HTMLSpanElement>(null) as RefObject<HTMLElement>;

  const { update } = useCountUp({
    ref: spanRef,
    end: value,
    duration: 1.5,
    decimals: isPercentage ? 1 : 0,
    separator: ",",
    suffix: isPercentage ? "%" : "",
  });

  useEffect(() => {
    update(value);
  }, [value, update]);

  // Currency values are pre-formatted (symbol + separators); percentages animate.
  const displayValue = !isPercentage && formatFn ? formatFn(value) : undefined;

  return (
    <Card className="text-center h-100">
      <CardBody className="py-3">
        <p className="text-uppercase fw-medium text-body-secondary mb-1" style={{ fontSize: 12, letterSpacing: "0.06em" }}>
          {label}
        </p>
        {displayValue ? (
          <p className="mb-0 fw-medium" style={{ fontSize: 22, color }}>
            {displayValue}
          </p>
        ) : (
          <span ref={spanRef} className="fw-medium" style={{ fontSize: 22, color }} />
        )}
      </CardBody>
    </Card>
  );
}
