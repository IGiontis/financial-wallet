import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useCategories } from "../../transactions/hooks/useTransactions";
import { useAccountList } from "../../accounts/useMoneyAccounts";
import { mainAccount } from "../../accounts/accountsUtils";
import { useIncomes, useRecordArrival } from "../useIncomes";
import { expectedAmount, incomeArrivals, suggestIncomeCategory, type IncomeStatus } from "../incomesUtils";
import { makeFormats } from "../incomeText";
import IncomeCard from "./IncomeCard";
import ArrivedSheet from "./ArrivedSheet";

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
  const { incomes, statuses, transactions, now } = useIncomes();
  const { data: categories = [] } = useCategories();
  const accounts = useAccountList();
  const recordArrival = useRecordArrival();
  const [arriving, setArriving] = useState<IncomeStatus | null>(null);

  const income = incomes.find((i) => i.id === incomeId);
  if (!income) return null;

  const expected = expectedAmount(income, transactions);

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
      arrivals={incomeArrivals(income, transactions)}
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
