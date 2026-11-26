import { Modal, ModalHeader, ModalBody, Button } from "reactstrap";
import { DialogFooter } from "../../../shared/components/DialogFooter";
import { FiEdit2 } from "react-icons/fi";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import { useTranslation } from "react-i18next";
import type { Transaction, Category, BillWithStatus } from "../../../shared/types/IndexTypes";
import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { billKeys } from "../../bills/billCache";
import { categoryLabel } from "../../../shared/utils/categories";
import { dateFormat, firestoreToDate, formatRecordDay, sameDay, formatTime, formatDayShortTime } from "../../../shared/utils/dates";
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
import { findCategory } from "../../../shared/utils/categories";
import { useAccountList } from "../../accounts/useMoneyAccounts";
import { mainAccount } from "../../accounts/accountsUtils";
import { LockNote } from "./LockNote";
import type { LockState } from "../hooks/useRecordLocks";

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
  /** Half of a linked set? See `useRecordLocks`. Without it, only a loan's own cash is known to be. */
  lock?: LockState;
}

export default function TransactionViewModal({
  transaction: tx,
  categories,
  formatCurrency,
  onClose,
  onEdit,
  onDelete,
  lock,
}: Props) {
  const { t, i18n } = useTranslation();
  const { displayCurrency } = useCurrencyConverter();
  // The context, not `useQueryClient()`: the sheet is also drawn where no data
  // layer is around it (its own tests, a preview) — there it simply has no
  // bills to look in, rather than throwing.
  const queryClient = useContext(QueryClientContext);
  const { currentUser } = useAuth();
  const accounts = useAccountList();
  const cat = resolveCategory(tx, categories);
  const lang = i18n.resolvedLanguage ?? "en";

  // Where the money went in or came out: its card, or the main account when
  // none was named — which is where every figure in the app counts it.
  const named = accounts.find((a) => a.id === tx.accountId);
  const main = mainAccount(accounts);
  const accountName = named ? named.name : main ? t("transactions.view.mainCard", { name: main.name }) : undefined;

  // The time it was written down. The date of a record is a day, not a
  // moment, so the clock comes from when it was entered — and says so.
  const created = tx.createdAt ? firestoreToDate(tx.createdAt) : undefined;
  const writtenThatDay = sameDay(created, firestoreToDate(tx.date));
  const recordedAt =
    created && !Number.isNaN(created.getTime())
      ? (writtenThatDay ? formatTime(created, lang) : formatDayShortTime(created, lang))
      : undefined;
  const isGoal = !!tx.isGoalTransaction;
  const lockState: LockState = lock ?? { lock: tx.debtId ? { kind: "debt", debtId: tx.debtId } : tx.businessEntryId ? { kind: "business", entryId: tx.businessEntryId } : undefined, pending: false };
  // A covered expense keeps its payee and notes editable; it is deleted only with its debt.
  const covered = lockState.lock?.kind === "covered";
  const noEdit = isGoal || !!tx.isInvestmentTransaction || !!tx.debtId || !!tx.businessEntryId || lockState.pending;
  const noDelete = noEdit || covered;
  /**
   * The card, said the way the money moved. A goal's money kept in your own
   * bank never left it: "kept in". Handed to someone (`heldBy`) it did leave —
   * "given from Eurobank → Athanasia" — and given back, it came into a card.
   */
  const goalAccount = (name: string) => {
    if (isGoal && tx.heldBy) {
      return tx.contributionType === "withdrawal"
        ? { label: t("transactions.view.returnedInto"), name: `${tx.heldBy} → ${name}` }
        : { label: t("transactions.view.givenFrom"), name: `${name} → ${tx.heldBy}` };
    }
    if (isGoal) return { label: t("goalWizard.rowHeldIn"), name };
    return { label: t(isPositive ? "transactions.view.into" : "transactions.view.outOf"), name };
  };
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

  // A clearing bill's expense says so, and which months it closed — read off
  // the bills already on the device (no read of its own).
  const clearing = (() => {
    if (!tx.billId) return undefined;
    const payments = queryClient?.getQueryData<BillWithStatus[]>(billKeys.all(currentUser?.uid ?? ""))?.flatMap((b) => b.payments) ?? [];
    const payment = payments.find((p) => p.transactionId === tx.id);
    if (!payment?.covers?.length) return undefined;
    const keys = [payment.periodKey, ...payments.filter((p) => p.coveredBy === payment.id).map((p) => p.periodKey)].sort();
    const monthOf = (key: string) => (/^\d{4}-\d{2}$/.test(key) ? dateFormat("monthYearShort", lang).format(new Date(`${key}-01T00:00:00`)) : key);
    const span = keys.length > 1 ? `${monthOf(keys[0])} – ${monthOf(keys[keys.length - 1])}` : monthOf(keys[0]);
    return t("bills.clear.boxValue", { count: 1 + payment.covers.length, span });
  })();

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
          dateFormatted={formatRecordDay(firestoreToDate(tx.date), i18n.resolvedLanguage ?? "en")}
          notes={tx.notes}
          fuelCells={fuelCells}
          hideCategoryLabel={isGoal || isInvestment}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
          account={accountName ? goalAccount(accountName) : undefined}
          recordedAt={recordedAt}
          clearing={clearing}
        />
        {/* A loan's money, or the expense of a goal a friend paid: written
            by the debt and kept in step with it — changed from there. */}
        <LockNote state={lockState} onLeave={onClose} />
      </ModalBody>
      {(onEdit || onDelete) && (
        <>
          {/* No "Close": the ✕ above closes it, and a third button was one more thing to read. */}
          {/* Delete far left, away from Edit (rule 15b, `DialogFooter`). A goal's or an
              investment's mirror is changed and deleted from its goal: here it
              would leave the contribution behind. */}
          <DialogFooter remove={onDelete ? <DeleteButton opensConfirm onClick={onDelete} disabled={noDelete} /> : undefined}>
            {onEdit && (
              <Button color="primary" onClick={onEdit} disabled={noEdit}>
                <FiEdit2 size={14} className="me-1" aria-hidden />
                {t("common.edit")}
              </Button>
            )}
          </DialogFooter>
        </>
      )}
    </Modal>
  );
}
