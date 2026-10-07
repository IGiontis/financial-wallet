import { Modal, ModalHeader, ModalBody, ModalFooter, Button } from "reactstrap";
import { FiEdit2 } from "react-icons/fi";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import { useTranslation } from "react-i18next";
import type { Transaction, Category } from "../../../shared/types/IndexTypes";
import { categoryLabel } from "../../../shared/utils/categories";
import { firestoreToDate } from "../../../shared/utils/dates";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { intlLocale } from "../../../i18n";
import {
  formatUnitPrice,
  fuelTypeLabelKey,
  getUnitLabel,
} from "../../categories/fuelTypes";
import { TransactionReviewBody, type FuelCell } from "./TransactionReviewBody";
import {
  EXPENSE_COLORS,
  INCOME_COLORS,
  GOAL_COLORS,
  INVESTMENT_COLORS,
} from "./reviewPalettes";
import { formatTable } from "../transactionDates";
import { findCategory } from "../../../shared/utils/categories";

function resolveCategory(tx: Transaction, categories: Category[]) {
  if (tx.isGoalTransaction) return { icon: "🎯", name: "Goal" };
  if (tx.isInvestmentTransaction)
    return (
      categories.find((c) => c.name === "Investments") ?? {
        icon: "📈",
        name: "Investments",
      }
    );
  return findCategory(categories, tx.categoryId);
}

interface Props {
  transaction: Transaction;
  categories: Category[];
  formatCurrency: (n: number) => string;
  onClose: () => void;
  /** Where the phone list's records are changed and deleted — the list itself only opens them. */
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function TransactionViewModal({
  transaction: tx,
  categories,
  formatCurrency,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const { t, i18n } = useTranslation();
  const { displayCurrency } = useCurrencyConverter();
  const cat = resolveCategory(tx, categories);
  const isGoal = !!tx.isGoalTransaction;
  const isInvestment = !!tx.isInvestmentTransaction && !isGoal;
  const isPositive =
    isGoal || isInvestment
      ? tx.contributionType === "withdrawal"
      : tx.type === "income";

  const contributionSign = tx.contributionType === "withdrawal" ? "+" : "−";
  const directionColor =
    tx.contributionType === "withdrawal"
      ? "var(--color-income)"
      : "var(--color-expense)";

  const colors = isGoal
    ? { ...GOAL_COLORS, sign: contributionSign }
    : isInvestment
      ? { ...INVESTMENT_COLORS, sign: contributionSign }
      : isPositive
        ? INCOME_COLORS
        : EXPENSE_COLORS;

  const gradientFrom = isGoal
    ? "var(--color-goal)"
    : isInvestment
      ? "var(--bs-primary)"
      : undefined;
  const gradientTo = isGoal || isInvestment ? directionColor : undefined;

  const primaryBadge = isGoal
    ? categoryLabel("Goal", t)
    : isInvestment
      ? categoryLabel("Investments", t)
      : isPositive
        ? t("transactions.income")
        : t("transactions.expense");
  const secondaryBadgeKind =
    (isGoal || isInvestment) && tx.contributionType
      ? tx.contributionType === "withdrawal"
        ? "withdrawal"
        : "deposit"
      : undefined;
  const secondaryBadge = secondaryBadgeKind
    ? t(
        secondaryBadgeKind === "withdrawal"
          ? "transactions.withdrawal"
          : "transactions.deposit",
      )
    : undefined;

  const meta = tx.metadata;
  const fuelCells: FuelCell[] = meta?.fuelType
    ? [
        {
          label: t("transactions.fuelType"),
          value: t(fuelTypeLabelKey(meta.fuelType)),
        },
        ...(meta.pricePerUnit != null
          ? [
              {
                label: t("transactions.pricePerUnitLabel", {
                  unit: getUnitLabel(meta.fuelType),
                }),
                value: formatUnitPrice(
                  meta.pricePerUnit,
                  displayCurrency,
                  intlLocale(i18n.resolvedLanguage),
                ),
              },
            ]
          : []),
        ...(meta.quantity != null
          ? [
              {
                label: t("transactions.quantity"),
                value: String(meta.quantity),
              },
            ]
          : []),
        ...(meta.odometer != null
          ? [
              {
                label: t("transactions.odometer"),
                value: `${meta.odometer} km`,
              },
            ]
          : []),
        ...(meta.place
          ? [{ label: t("transactions.place"), value: meta.place }]
          : []),
      ]
    : [];

  return (
    <Modal isOpen toggle={onClose} centered size="md">
      <ModalHeader toggle={onClose}>
        {t("transactions.transactionDetails")}
      </ModalHeader>
      <ModalBody>
        <TransactionReviewBody
          subtitle={t("transactions.detailsSubtitle")}
          description={tx.description}
          categoryIcon={cat?.icon ?? ""}
          categoryName={categoryLabel(cat?.name, t) || "—"}
          primaryBadge={primaryBadge}
          secondaryBadge={secondaryBadge}
          secondaryBadgeKind={secondaryBadgeKind}
          colors={colors}
          amount={tx.amount}
          formatAmount={formatCurrency}
          dateFormatted={formatTable(firestoreToDate(tx.date), i18n.resolvedLanguage ?? "en")}
          notes={tx.notes}
          fuelCells={fuelCells}
          hideCategoryLabel={isGoal || isInvestment}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
        />
        {/* A loan's money: written by the debt and kept in step with it. */}
        {tx.debtId && <p className="small text-body-secondary mt-3 mb-0">{t("transactions.debtLocked")}</p>}
      </ModalBody>
      {(onEdit || onDelete) && (
        <>
          {/* No "Close": the ✕ above closes it, and a third button was one more thing to read. */}
          <ModalFooter className="justify-content-between">
            {/* Delete on its own at the left, away from Edit. A goal's or an
                investment's mirror is changed and deleted from its goal: here it
                would leave the contribution behind. */}
            {onDelete ? (
              <DeleteButton opensConfirm
                onClick={onDelete}
                disabled={isGoal || !!tx.isInvestmentTransaction || !!tx.debtId}
              />
            ) : (
              <span />
            )}
            <span className="d-flex gap-2">
              {onEdit && (
                <Button
                  color="primary"
                  onClick={onEdit}
                  disabled={isGoal || !!tx.isInvestmentTransaction || !!tx.debtId}
                >
                  <FiEdit2 size={14} className="me-1" aria-hidden />
                  {t("common.edit")}
                </Button>
              )}
            </span>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
