import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { startOfMonth } from "date-fns";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { InfoLegend, type LegendEntry } from "../../../shared/components/InfoLegend";
import { MonthCalendar } from "../../calendar/components/MonthCalendar";
import { signedMoney } from "../../calendar/signedMoney";
import { dayKey } from "../../calendar/components/dayKey";
import calendarStyles from "../../calendar/css/CalendarPage.module.css";
import { transactionMonth, transactionMonthRange, type TransactionDay } from "../transactionMonth";

// The Transactions page's «Ημερολόγιο» tab: the «Ημερολόγιο» page's month —
// the same header, tiles, grid, day square and day list — drawn from what
// actually happened. Each day shows what it came to, its income less its
// expenses, by the list's own rule; a tap lists the day's records, each
// opening as it does on the list. No reads of its own: the records are the
// page's, already on the device.

export interface TransactionsCalendarTabProps {
  transactions: Transaction[];
  /** The day's records, drawn as the list draws them; `onLeave` closes the day's dialog first. */
  renderRecords: (records: Transaction[], onLeave?: () => void) => ReactNode;
  /** Today; a test sets it. */
  now?: Date;
}

export function TransactionsCalendarTab({ transactions, renderRecords, now: givenNow }: TransactionsCalendarTabProps) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrencyConverter();
  const [now] = useState(() => givenNow ?? new Date());
  const [month, setMonth] = useState(() => startOfMonth(now));

  const { days, totals } = useMemo(() => transactionMonth(transactions, month), [transactions, month]);
  const { first, last } = useMemo(() => transactionMonthRange(transactions, now), [transactions, now]);

  return (
    <div className={calendarStyles.page}>
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        now={now}
        first={first}
        last={last}
        titleAs="h2"
        scope={
          <>
            <p className={calendarStyles.scope}>{t("transactions.calendar.scope")}</p>
            <InfoLegend title={t("calendar.keyTitle")} entries={transactionKey(t)}>
              <p>{t("transactions.calendar.keySign")}</p>
            </InfoLegend>
          </>
        }
        totals={{ in: totals.earned, out: totals.spent }}
        dayOf={(date) => {
          const day = days.get(date.getDate());
          if (!day) return undefined;
          const counted = day.in > 0 || day.out > 0;
          return {
            look: { in: day.in > 0 ? "todo" : undefined, out: day.out > 0 ? "todo" : undefined },
            net: counted ? day.net : null,
            spoken: spokenDay(day, t, formatCurrency),
          };
        }}
        renderDay={(date, onLeave) => {
          const day = days.get(date.getDate());
          if (!day) return null;
          // A day that moved borrowed money says two things, never one sum of
          // both: what of it was the reader's own, and what was the loan's.
          const borrowed = day.borrowedIn > 0 || day.borrowedOut > 0;
          return (
            <>
              {renderRecords(day.records, onLeave)}
              {/* What the day came to: its own money, once there is more than one record to add up — or always, where borrowed money would otherwise be read into it. */}
              {(borrowed || (day.records.length > 1 && (day.in > 0 || day.out > 0))) && (
                <div className={`${calendarStyles.sheetNet} mt-3`}>
                  <span>{t(borrowed ? "transactions.calendar.ownNet" : "calendar.net")}</span>
                  <strong style={{ color: day.net < 0 ? "var(--color-expense-text)" : "var(--color-income-text)" }}>{signedMoney(day.net, formatCurrency)}</strong>
                </div>
              )}
              {day.borrowedIn > 0 && <p className={calendarStyles.sheetAside}>{t("transactions.calendar.borrowedIn", { amount: formatCurrency(day.borrowedIn) })}</p>}
              {day.borrowedOut > 0 && <p className={calendarStyles.sheetAside}>{t("transactions.calendar.borrowedOut", { amount: formatCurrency(day.borrowedOut) })}</p>}
            </>
          );
        }}
        emptyDay={t("transactions.calendar.emptyDay")}
      />
    </div>
  );
}

/** For a screen reader: "Income +1.200,00 €, Expenses −45,00 €, loan money in 100,00 €, 3 records". */
function spokenDay(day: TransactionDay, t: TFunction, formatCurrency: (n: number) => string) {
  const parts: string[] = [];
  if (day.in > 0) parts.push(`${t("calendar.in")} +${formatCurrency(day.in)}`);
  if (day.out > 0) parts.push(`${t("calendar.out")} −${formatCurrency(day.out)}`);
  // The borrowed part is said too, and said as borrowed: the day's own figure leaves it out.
  if (day.borrowedIn > 0) parts.push(t("transactions.calendar.borrowedIn", { amount: formatCurrency(day.borrowedIn) }));
  if (day.borrowedOut > 0) parts.push(t("transactions.calendar.borrowedOut", { amount: formatCurrency(day.borrowedOut) }));
  parts.push(t("transactions.transactionCount", { count: day.records.length }));
  return parts.join(", ");
}

/** The colours this calendar uses, drawn with the classes a day itself uses. */
const transactionKey = (t: TFunction): LegendEntry[] => [
  dayKey("in", { in: "todo" }, t("transactions.calendar.keyIn")),
  dayKey("out", { out: "todo" }, t("transactions.calendar.keyOut")),
  dayKey("both", { in: "todo", out: "todo" }, t("transactions.calendar.keyBoth")),
  dayKey("today", { today: true }, t("calendar.keyToday")),
];

export default TransactionsCalendarTab;
