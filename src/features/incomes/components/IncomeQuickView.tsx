import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useCategories } from "../../transactions/hooks/useTransactions";
import { useAccountList } from "../../accounts/useMoneyAccounts";
import { mainAccount } from "../../accounts/accountsUtils";
import { useOfflineGuard } from "../../../shared/hooks/useOfflineGuard";
import { useIncomes, useRecordArrival, useUndoArrival } from "../useIncomes";
import { expectedAmount, suggestIncomeCategory, undoableArrivals, type ArrivalUndo, type IncomeStatus } from "../incomesUtils";
import { makeFormats } from "../incomeText";
import IncomeCard from "./IncomeCard";
import ArrivedSheet from "./ArrivedSheet";
import { ConfirmSheet } from "./ConfirmSheet";

/**
 * An income's card, from anywhere that lists incomes — the Planner's rows —
 * with «Ήρθε» on it: the same card and the same sheet as on «Έσοδα», the same
 * transaction written, so the plan and the page cannot tell two stories.
 * Changing the income itself is left to «Έσοδα» (`onEdit`).
 */
export default function IncomeQuickView({ incomeId, onClose, onEdit }: { incomeId: string; onClose: () => void; onEdit?: () => void }) {
  const { t, i18n } = useTranslation();
  const f = useMemo(() => makeFormats(i18n.resolvedLanguage ?? "en"), [i18n.resolvedLanguage]);
  const { format: formatCurrency } = useCurrencyConverter();
  const { incomes, statuses, transactions, overrides, setOverride, now } = useIncomes();
  const { data: categories = [] } = useCategories();
  const accounts = useAccountList();
  const recordArrival = useRecordArrival();
  const [arriving, setArriving] = useState<IncomeStatus | null>(null);
  // One «Ήρθε» to take back, asked about first — as on «Έσοδα».
  const [undoing, setUndoing] = useState<ArrivalUndo | null>(null);
  const undoArrival = useUndoArrival(overrides, setOverride);
  const deleteGuard = useOfflineGuard("delete");

  const income = incomes.find((i) => i.id === incomeId);
  if (!income) return null;

  const expected = expectedAmount(income, transactions);

  if (undoing) {
    return (
      <ConfirmSheet
        title={t("incomes.confirm.undoTitle")}
        body={t(undoing.transactionIds.length > 0 ? "incomes.confirm.undoBody" : "incomes.confirm.undoBodyNoRecord", {
          amount: formatCurrency(undoing.amount),
          date: f.weekdayDate.format(undoing.date),
          name: income.name,
        })}
        confirmLabel={t("incomes.card.undoRecord")}
        lockedReason={deleteGuard.locked && undoing.transactionIds.length > 0 ? deleteGuard.reason : undefined}
        onConfirm={() => {
          undoArrival(undoing);
          setUndoing(null);
        }}
        onClose={() => setUndoing(null)}
      />
    );
  }

  if (arriving) {
    const category = categories.find((c) => c.id === income.categoryId && c.type === "income") ?? suggestIncomeCategory(income.kind, categories);
    return (
      <ArrivedSheet
        income={income}
        status={arriving}
        options={statuses}
        expected={expected}
        accounts={accounts}
        mainAccountId={mainAccount(accounts)?.id}
        category={category}
        f={f}
        onClose={() => setArriving(null)}
        onConfirm={(status, input) => {
          void recordArrival(income, status, input);
          onClose();
        }}
      />
    );
  }

  return (
    <IncomeCard
      income={income}
      statuses={statuses}
      expected={expected}
      arrivals={undoableArrivals(income, statuses, transactions)}
      onUndoArrival={(_, arrival) => setUndoing(arrival)}
      accountName={income.accountId ? accounts.find((a) => a.id === income.accountId)?.name : undefined}
      formatCurrency={formatCurrency}
      f={f}
      now={now}
      onClose={onClose}
      onEdit={onEdit ? () => onEdit() : undefined}
      editLabel={t("incomes.card.editOnIncomes")}
      onArrive={(_, status) => setArriving(status)}
    />
  );
}
