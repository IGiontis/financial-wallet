import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { InfoLegend, type LegendEntry } from "../../shared/components/InfoLegend";
import { MonthCalendar } from "../calendar/components/MonthCalendar";
import { signedMoney } from "../calendar/signedMoney";
import { dayKey } from "../calendar/components/dayKey";
import calendarStyles from "../calendar/css/CalendarPage.module.css";
import type { BusinessEntry } from "../../shared/types/IndexTypes";
import { closingFigures, monthCalendar, monthStart, type BusinessDay } from "./businessSummary";
import { profitTone, signed } from "./businessFormat";
import styles from "./css/Business.module.css";

// «Ημερολόγιο»: the page's month as the «Ημερολόγιο» page draws one — the same
// header, tiles, grid, day square and key (`MonthCalendar`), the way the
// Transactions calendar uses it. Each day with a closing shows what it came
// to, signed; the tiles are what reached the owner's own money that month —
// the profits that came in and the losses that went out. A tap lists the
// day's closings; each opens in its read-only view, editing a step from there.
// No reads of its own: the closings are the page's, and so is the month.

export function BusinessCalendar({
  entries,
  month,
  onMonthChange,
  first,
  now,
  onOpen,
  formatCurrency,
  businessName,
}: {
  entries: readonly BusinessEntry[];
  month: Date;
  onMonthChange: (month: Date) => void;
  first: Date;
  now: Date;
  onOpen: (entry: BusinessEntry) => void;
  formatCurrency: (n: number) => string;
  /** The business a closing belongs to, said on its row — when the page shows all of them. */
  businessName?: (entry: BusinessEntry) => string;
}) {
  const { t } = useTranslation();
  const { days, totals } = useMemo(() => monthCalendar(entries, month), [entries, month]);

  return (
    <div className={calendarStyles.page}>
      <MonthCalendar
        month={month}
        onMonthChange={(m) => onMonthChange(monthStart(m))}
        now={now}
        first={monthStart(first)}
        last={monthStart(now)}
        titleAs="h2"
        scope={
          <>
            <p className={calendarStyles.scope}>{t("business.calendarScope")}</p>
            <InfoLegend title={t("calendar.keyTitle")} entries={businessKey(t)}>
              <p>{t("business.calendarKeySign")}</p>
            </InfoLegend>
          </>
        }
        totals={{
          in: totals.in,
          out: totals.out,
          inSub: t("business.calendarInSub", { count: totals.inCount }),
          outSub: t("business.calendarOutSub", { count: totals.outCount }),
        }}
        dayOf={(date) => {
          const day = days.get(date.getDate());
          if (!day) return undefined;
          return {
            look: { in: day.gained ? "todo" : undefined, out: day.lost ? "todo" : undefined },
            net: day.profit,
            spoken: spokenDay(day, t, formatCurrency),
          };
        }}
        renderDay={(date, onLeave) => {
          const day = days.get(date.getDate());
          if (!day) return null;
          return (
            <>
              <ul className={styles.rows}>
                {day.entries.map((entry) => {
                  const f = closingFigures(entry);
                  return (
                    <li key={entry.id} className={styles.row}>
                      <button
                        type="button"
                        className={styles.rowMain}
                        onClick={() => {
                          onLeave?.();
                          onOpen(entry);
                        }}
                        aria-label={`${businessName ? `${businessName(entry)} · ` : ""}${t("business.closingTitle")}: ${t("business.profit")} ${signed(f.profit, formatCurrency)}`}
                      >
                        <span className={styles.rowText}>
                          {businessName && <span className={styles.rowBusiness}>{businessName(entry)}</span>}
                          <span className={styles.rowMeta}>
                            {t("business.turnover")} <span className={styles.rowFigure}>{formatCurrency(f.turnover)}</span>
                          </span>
                          <span className={styles.rowMeta}>
                            {t("business.expenses")} <span className={styles.rowFigure}>{formatCurrency(f.expenses)}</span>
                          </span>
                        </span>
                        <span className={`${styles.rowAmount} ${profitTone(f.profit, styles)}`}>{signed(f.profit, formatCurrency)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {/* What the day came to, once there is more than one closing to add up. */}
              {day.entries.length > 1 && (
                <div className={`${calendarStyles.sheetNet} mt-3`}>
                  <span>{t("calendar.net")}</span>
                  <strong style={{ color: day.profit < 0 ? "var(--color-expense-text)" : "var(--color-income-text)" }}>{signedMoney(day.profit, formatCurrency)}</strong>
                </div>
              )}
            </>
          );
        }}
        emptyDay={t("business.calendarEmptyDay")}
      />
    </div>
  );
}

/** For a screen reader: "Profit +260,00 €, 1 closing". */
function spokenDay(day: BusinessDay<BusinessEntry>, t: TFunction, formatCurrency: (n: number) => string) {
  return `${t("business.profit")} ${signedMoney(day.profit, formatCurrency)}, ${t("business.closingsCount", { count: day.entries.length })}`;
}

/** The colours this calendar uses, drawn with the classes a day itself uses. */
const businessKey = (t: TFunction): LegendEntry[] => [
  dayKey("in", { in: "todo" }, t("business.calendarKeyIn")),
  dayKey("out", { out: "todo" }, t("business.calendarKeyOut")),
  dayKey("both", { in: "todo", out: "todo" }, t("business.calendarKeyBoth")),
  dayKey("today", { today: true }, t("calendar.keyToday")),
];
