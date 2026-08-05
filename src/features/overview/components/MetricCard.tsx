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
  const displayValue = formatFn ? formatFn(value) : isPercentage ? `${value.toFixed(1)}%` : value.toLocaleString();

  return (
    <Card className="text-center h-100">
      <CardBody className="py-3">
        <p className="text-uppercase fw-medium text-body-secondary mb-1" style={{ fontSize: 12, letterSpacing: "0.06em" }}>
          {label}
        </p>
        <p className="mb-0 fw-medium" style={{ fontSize: 22, color }}>
          {displayValue}
        </p>
      </CardBody>
    </Card>
  );
}
