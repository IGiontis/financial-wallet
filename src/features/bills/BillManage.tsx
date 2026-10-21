import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ManageList, type ManageGroup } from "../../shared/components/ManageList";
import { currentPause, getFrequencyLabel, startsLater } from "./billsUtils";
import type { BillWithStatus, Category } from "../../shared/types/IndexTypes";

/**
 * «Πάγια › Διαχείριση»: every bill, the running ones and then the switched-off
 * ones, alphabetical, each with how often and when it falls — and a switch to
 * turn it on or off where it stands.
 */
export function BillManage({
  bills,
  categoryFor,
  now,
  onEdit,
  onDelete,
  deleteLocked,
  deleteReason,
  onToggle,
}: {
  bills: BillWithStatus[];
  onToggle: (bill: BillWithStatus, active: boolean) => void;
  categoryFor: (id: string) => Category | undefined;
  now: Date;
  onEdit: (bill: BillWithStatus) => void;
  onDelete: (bill: BillWithStatus) => void;
  deleteLocked?: boolean;
  deleteReason?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";

  const groups = useMemo<ManageGroup[]>(() => {
    const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
    const startFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
    const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "long" });

    const day = (bill: BillWithStatus) => {
      if (bill.dueDay === undefined || bill.dueDay === null) return t("manage.noDay");
      if (bill.frequency === "weekly") return t("manage.weekday", { day: weekdayFmt.format(new Date(2024, 0, 7 + bill.dueDay)) });
      if (bill.frequency === "yearly" && bill.dueMonth !== undefined && bill.dueMonth !== null) return `${bill.dueDay} ${monthFmt.format(new Date(2024, bill.dueMonth, 1))}`;
      return t("manage.dayOfMonth", { day: bill.dueDay });
    };
    const when = (bill: BillWithStatus) => {
      const freq = getFrequencyLabel(bill);
      return `${t(freq.key, { count: freq.count })} · ${day(bill)}`;
    };

    const off = (bill: BillWithStatus) => {
      if (!bill.isActive) return undefined;
      const starts = startsLater(bill, now);
      if (starts) return t("bills.lineStartsOn", { month: startFmt.format(starts) });
      const pause = currentPause(bill, now)?.state;
      if (pause === "ended") return t("bills.lineStopped");
      if (pause === "paused") return t("bills.linePaused");
      return undefined;
    };

    const item = (bill: BillWithStatus) => ({
      id: bill.id,
      name: bill.name,
      icon: categoryFor(bill.categoryId)?.icon ?? "🧾",
      meta: when(bill),
      offTag: off(bill),
      active: bill.isActive,
    });
    const sorted = [...bills].sort((a, b) => a.name.localeCompare(b.name, locale));
    return [
      { key: "on", title: t("manage.groupOn"), tone: "success", items: sorted.filter((b) => b.isActive).map(item) },
      { key: "off", title: t("manage.groupOff"), tone: "secondary", items: sorted.filter((b) => !b.isActive).map(item) },
    ];
  }, [bills, categoryFor, locale, now, t]);

  const byId = (id: string) => bills.find((bill) => bill.id === id);
  return (
    <ManageList
      groups={groups}
      hint={t("bills.manageHint", { count: bills.length })}
      onEdit={(id) => {
        const bill = byId(id);
        if (bill) onEdit(bill);
      }}
      onDelete={(id) => {
        const bill = byId(id);
        if (bill) onDelete(bill);
      }}
      deleteLocked={deleteLocked}
      deleteReason={deleteReason}
      onToggle={(id, active) => {
        const bill = byId(id);
        if (bill) onToggle(bill, active);
      }}
    />
  );
}

export default BillManage;
