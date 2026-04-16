import { Modal, ModalHeader, ModalBody, ModalFooter, Button } from "reactstrap";
import { format } from "date-fns";
import type { Transaction, Category } from "../../../shared/types/IndexTypes";
import { EXPENSE_COLORS, INCOME_COLORS, TransactionReviewBody, type FuelCell } from "./TransactionReviewBody";

function firestoreToDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

function resolveCategory(tx: Transaction, categories: Category[]) {
  if (tx.isGoalTransaction) return { icon: "🎯", name: "Goal" };
  if (tx.isInvestmentTransaction) return categories.find((c) => c.name === "Investments") ?? { icon: "📈", name: "Investments" };
  return categories.find((c) => c.id === tx.categoryId);
}

interface Props {
  transaction: Transaction;
  categories: Category[];
  formatCurrency: (n: number) => string;
  onClose: () => void;
}

export default function TransactionViewModal({ transaction: tx, categories, formatCurrency, onClose }: Props) {
  const cat = resolveCategory(tx, categories);
  const isGoal = !!tx.isGoalTransaction;
  const isInvestment = !!tx.isInvestmentTransaction && !isGoal;
  const isPositive = isGoal || isInvestment
    ? tx.contributionType === "withdrawal"
    : tx.type === "income";

  const colors = isPositive ? INCOME_COLORS : EXPENSE_COLORS;

  const primaryBadge = isGoal ? "Goal" : isInvestment ? "Investment" : isPositive ? "Income" : "Expense";
  const secondaryBadge = (isGoal || isInvestment) && tx.contributionType
    ? tx.contributionType === "withdrawal" ? "Withdrawal" : "Deposit"
    : undefined;

  const meta = tx.metadata as any;
  const fuelCells: FuelCell[] = meta?.fuelType
    ? [
        { label: "Fuel type",    value: String(meta.fuelType).charAt(0).toUpperCase() + String(meta.fuelType).slice(1) },
        ...(meta.pricePerUnit != null ? [{ label: "Price / unit", value: `€${meta.pricePerUnit}` }] : []),
        ...(meta.quantity      != null ? [{ label: "Quantity",    value: String(meta.quantity) }] : []),
        ...(meta.odometer      != null ? [{ label: "Odometer",    value: `${meta.odometer} km` }] : []),
        ...(meta.place               ? [{ label: "Place",         value: meta.place }] : []),
      ]
    : [];

  return (
    <Modal isOpen toggle={onClose} size="md">
      <ModalHeader toggle={onClose}>Transaction details</ModalHeader>
      <ModalBody>
        <TransactionReviewBody
          subtitle="Here are the full details for this transaction."
          icon={cat?.icon ?? "💳"}
          description={tx.description}
          categoryIcon={cat?.icon ?? ""}
          categoryName={cat?.name ?? "—"}
          primaryBadge={primaryBadge}
          secondaryBadge={secondaryBadge}
          colors={colors}
          amount={tx.amount}
          formatAmount={formatCurrency}
          dateFormatted={format(firestoreToDate(tx.date), "dd/MM/yyyy")}
          notes={tx.notes}
          fuelCells={fuelCells}
        />
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}