import { Modal, ModalHeader, ModalBody, ModalFooter, Button } from "reactstrap";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import type { Transaction, Category } from "../../../shared/types/IndexTypes";
import { categoryLabel } from "../../../shared/utils/categories";
import { firestoreToDate } from "../../../shared/utils/dates";
import { EXPENSE_COLORS, INCOME_COLORS, GOAL_COLORS, INVESTMENT_COLORS, TransactionReviewBody, type FuelCell } from "./TransactionReviewBody";

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
  const { t } = useTranslation();
  const cat = resolveCategory(tx, categories);
  const isGoal = !!tx.isGoalTransaction;
  const isInvestment = !!tx.isInvestmentTransaction && !isGoal;
  const isPositive = isGoal || isInvestment ? tx.contributionType === "withdrawal" : tx.type === "income";

  const contributionSign = tx.contributionType === "withdrawal" ? "+" : "−";
  const directionColor = tx.contributionType === "withdrawal" ? "var(--color-income)" : "var(--color-expense)";

  const colors = isGoal
    ? { ...GOAL_COLORS, sign: contributionSign }
    : isInvestment
      ? { ...INVESTMENT_COLORS, sign: contributionSign }
      : isPositive
        ? INCOME_COLORS
        : EXPENSE_COLORS;

  const gradientFrom = isGoal ? "var(--color-goal)" : isInvestment ? "var(--bs-primary)" : undefined;
  const gradientTo = isGoal || isInvestment ? directionColor : undefined;

  const primaryBadge = isGoal ? categoryLabel("Goal", t) : isInvestment ? categoryLabel("Investments", t) : isPositive ? t("transactions.income") : t("transactions.expense");
  const secondaryBadge = (isGoal || isInvestment) && tx.contributionType ? (tx.contributionType === "withdrawal" ? t("transactions.withdrawal") : t("transactions.deposit")) : undefined;

  const meta = tx.metadata as any;
  const fuelCells: FuelCell[] = meta?.fuelType
    ? [
        { label: t("transactions.fuelType"), value: String(meta.fuelType).charAt(0).toUpperCase() + String(meta.fuelType).slice(1) },
        ...(meta.pricePerUnit != null ? [{ label: "Price / unit", value: `€${meta.pricePerUnit}` }] : []),
        ...(meta.quantity != null ? [{ label: t("transactions.quantity"), value: String(meta.quantity) }] : []),
        ...(meta.odometer != null ? [{ label: t("transactions.odometer"), value: `${meta.odometer} km` }] : []),
        ...(meta.place ? [{ label: t("transactions.place"), value: meta.place }] : []),
      ]
    : [];

  return (
    <Modal isOpen toggle={onClose} centered size="md">
      <ModalHeader toggle={onClose}>{t("transactions.transactionDetails")}</ModalHeader>
      <ModalBody>
        <TransactionReviewBody
          subtitle="Here are the full details for this transaction."
          description={tx.description}
          categoryIcon={cat?.icon ?? ""}
          categoryName={categoryLabel(cat?.name, t) || "—"}
          primaryBadge={primaryBadge}
          secondaryBadge={secondaryBadge}
          colors={colors}
          amount={tx.amount}
          formatAmount={formatCurrency}
          dateFormatted={format(firestoreToDate(tx.date), "dd/MM/yyyy")}
          notes={tx.notes}
          fuelCells={fuelCells}
          hideCategoryLabel={isGoal || isInvestment}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
