import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ManageList, type ManageGroup } from "../../../shared/components/ManageList";
import { toISOMonth } from "../../../shared/utils/dates";
import { currentPause } from "../../bills/billsUtils";
import { KIND_ICON, isActiveIncome, type Income } from "../incomesUtils";
import { scheduleText, type IncomeFormats } from "../incomeText";

/**
 * «Έσοδα › Διαχείριση»: every income — the running ones, then the archived —
 * alphabetical, with when it comes and whether it is off.
 */
export function IncomeManage({
  incomes,
  f,
  now,
  onEdit,
  onDelete,
  deleteLocked,
  deleteReason,
}: {
  incomes: Income[];
  f: IncomeFormats;
  now: Date;
  onEdit: (income: Income) => void;
  onDelete: (income: Income) => void;
  deleteLocked?: boolean;
  deleteReason?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";

  const groups = useMemo<ManageGroup[]>(() => {
    const thisMonth = toISOMonth(now);
    const off = (income: Income) => {
      if (!isActiveIncome(income)) return t("incomes.manageArchived");
      // "YYYY-MM" strings order as the months do.
      if (income.end && income.end < thisMonth) return t("incomes.list.stopped");
      const pause = currentPause(income, now);
      if (pause?.state === "ended") return t("incomes.list.stopped");
      if (pause?.state === "paused") return pause.to ? t("incomes.list.pausedUntil", { month: f.monthYearShort.format(pause.to) }) : t("bills.linePaused");
      return undefined;
    };
    const item = (income: Income) => ({
      id: income.id,
      name: income.name,
      icon: KIND_ICON[income.kind],
      meta: scheduleText(income, t, f),
      tag: income.isSalary ? t("incomes.kind.salary") : undefined,
      offTag: off(income),
    });
    const sorted = [...incomes].sort((a, b) => a.name.localeCompare(b.name, locale));
    return [
      { key: "active", title: t("incomes.tiles.active"), tone: "success", items: sorted.filter(isActiveIncome).map(item) },
      { key: "archived", title: t("incomes.list.archived"), tone: "secondary", items: sorted.filter((i) => !isActiveIncome(i)).map(item) },
    ];
  }, [incomes, f, locale, now, t]);

  const byId = (id: string) => incomes.find((income) => income.id === id);
  return (
    <ManageList
      groups={groups}
      hint={t("incomes.manageHint", { count: incomes.length })}
      onEdit={(id) => {
        const income = byId(id);
        if (income) onEdit(income);
      }}
      onDelete={(id) => {
        const income = byId(id);
        if (income) onDelete(income);
      }}
      deleteLocked={deleteLocked}
      deleteReason={deleteReason}
    />
  );
}

export default IncomeManage;
