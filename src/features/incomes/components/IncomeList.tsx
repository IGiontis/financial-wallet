import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheck, FiChevronRight } from "react-icons/fi";
import { currentPause } from "../../bills/billsUtils";
import { KIND_ICON, isSettled, type Income, type IncomeRow, type IncomeStatus, type MonthSummary, type RowSection } from "../incomesUtils";
import { shortSchedule, statusTag, type IncomeFormats } from "../incomeText";
import styles from "../css/IncomesPage.module.css";

// Option 1, «Λίστα σαν τα Πάγια»: the Bills page the other way round.
// «Περιμένεις» first — what is late sits at the top with its button — then
// «Ήρθαν», each with the day it came, then whatever is not this month's.

export interface IncomeListActions {
  onOpen: (income: Income) => void;
  onArrive: (income: Income, status: IncomeStatus) => void;
  /** «Ήταν ήδη στην τράπεζα;» — true for «Ναι, ήταν μέσα». */
  onBankAnswer: (income: Income, status: IncomeStatus, yes: boolean) => void;
  /** «Βάλε μέρα» on an income carried over without one. */
  onSetDay: (income: Income) => void;
}

interface ListProps extends IncomeListActions {
  rows: IncomeRow[];
  archived: Income[];
  nextMonth: MonthSummary;
  nextMonthDate: Date;
  incomes: Map<string, Income>;
  formatCurrency: (n: number) => string;
  accountName: (id: string | undefined) => string | undefined;
  lastReadingAt?: Date;
  f: IncomeFormats;
  now: Date;
}

const SECTIONS: { key: RowSection; title: string; tone: string }[] = [
  { key: "waiting", title: "incomes.list.waiting", tone: styles.toneWaiting },
  { key: "arrived", title: "incomes.list.arrived", tone: styles.toneArrived },
  { key: "later", title: "incomes.list.later", tone: styles.toneQuiet },
];

const sum = (list: number[]) => Math.round(list.reduce((a, b) => a + b, 0) * 100) / 100;

export function IncomeList(props: ListProps) {
  const { t } = useTranslation();
  const { rows, archived, nextMonth, nextMonthDate, incomes, formatCurrency, f } = props;
  const first = nextMonth.items[0];

  return (
    <div>
      {SECTIONS.map((section) => {
        const inSection = rows.filter((r) => r.section === section.key);
        if (inSection.length === 0) return null;
        const total =
          section.key === "waiting"
            ? sum(inSection.flatMap((r) => r.open.map((s) => s.expected)))
            : section.key === "arrived"
              ? sum(inSection.flatMap((r) => r.settled.map((s) => s.arrival?.amount ?? 0)))
              : undefined;
        const approximate = section.key === "waiting" && inSection.some((r) => r.open.some((s) => s.approximate));
        return (
          <section key={section.key} className="mb-3" aria-label={t(section.title)}>
            <div className={styles.section}>
              <span className={`${styles.sectionTitle} ${section.tone}`}>
                {t(section.title)} · {inSection.length}
              </span>
              {total !== undefined && (
                <span className={`${styles.sectionTotal} ${section.tone}`}>
                  {approximate ? "≈" : ""}
                  {formatCurrency(total)}
                </span>
              )}
            </div>
            <div className={styles.lines}>
              {inSection.map((row) => (
                <IncomeLine key={row.income.id} row={row} {...props} />
              ))}
            </div>
          </section>
        );
      })}

      {first && (
        <div className={`${styles.nextMonth} mb-3`}>
          <div className="d-flex justify-content-between align-items-baseline gap-2">
            <span className="fw-semibold" style={{ fontSize: 13 }}>
              {f.monthName(nextMonthDate)}
            </span>
            <span className="fw-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
              {nextMonth.approximate ? "≈" : ""}
              {formatCurrency(nextMonth.total)}
            </span>
          </div>
          <div className="text-body-secondary" style={{ fontSize: 12 }}>
            {t("incomes.list.nextMonthSub", { count: nextMonth.count, name: incomes.get(first.incomeId)?.name ?? "", date: f.weekdayDate.format(first.expectedDate) })}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <section className="mb-3" aria-label={t("incomes.list.archived")}>
          <div className={styles.section}>
            <span className={`${styles.sectionTitle} ${styles.toneQuiet}`}>
              {t("incomes.list.archived")} · {archived.length}
            </span>
          </div>
          <div className={styles.lines}>
            {archived.map((income) => (
              <div key={income.id} className={`${styles.lineWrap} ${styles.lineQuiet}`}>
                <div className={styles.line}>
                  <button type="button" className={styles.lineButton} onClick={() => props.onOpen(income)}>
                    <span className={styles.lineIcon} aria-hidden>
                      {KIND_ICON[income.kind]}
                    </span>
                    <span className={styles.lineMain}>
                      <span className={styles.lineName}>{income.name}</span>
                      <span className={styles.lineSub}>{shortSchedule(income, t, f)}</span>
                    </span>
                    <span className={styles.lineAmount}>{formatCurrency(income.amount)}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IncomeLine({ row, formatCurrency, accountName, lastReadingAt, f, now, onOpen, onArrive, onBankAnswer, onSetDay }: ListProps & { row: IncomeRow }) {
  const { t } = useTranslation();
  const { income, focus, section, next } = row;
  const tag = focus ? statusTag(focus, t, f) : undefined;
  const account = accountName(income.accountId);
  const approx = focus?.approximate ? "≈" : "";
  const pause = currentPause(income, now);

  let sub: string;
  let amount: string;
  if (section === "arrived") {
    amount = formatCurrency(sum(row.settled.map((s) => s.arrival?.amount ?? 0)));
    sub = [shortSchedule(income, t, f), next && t("incomes.list.next", { date: f.weekdayDate.format(next.expectedDate) })].filter(Boolean).join(" · ");
  } else if (section === "waiting" && focus) {
    amount = `${approx}${formatCurrency(focus.expected)}`;
    // Asked about one not due yet — next month's rent inside its ten days — is
    // "for" its day, not "was for" it.
    const when =
      focus.state === "late" || focus.state === "ask"
        ? t(focus.date < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? "incomes.list.wasFor" : "incomes.list.dueOn", { date: f.weekdayDate.format(focus.date) })
        : shortSchedule(income, t, f);
    const parts = [when, income.variable ? t("incomes.list.variableMean", { amount: formatCurrency(focus.expected) }) : undefined, account];
    if (row.open.length > 1) parts.push(t("incomes.list.moreOpen", { count: row.open.length - 1 }));
    sub = parts.filter(Boolean).join(" · ");
  } else {
    amount = `${income.variable ? "≈" : ""}${formatCurrency(focus?.expected ?? income.amount)}`;
    const upcoming = focus && !isSettled(focus) && focus.state !== "skipped" && focus.state !== "missed" ? focus : next;
    sub =
      pause?.state === "paused" && pause.to
        ? t("incomes.list.pausedUntil", { month: f.monthYearShort.format(pause.to) })
        : pause?.state === "ended"
          ? t("incomes.list.stopped")
          : upcoming
            ? t("incomes.list.nextOn", { date: f.weekdayDate.format(upcoming.expectedDate) })
            : shortSchedule(income, t, f);
  }

  // The bank question and «Ήρθε» never sit on the same row: the question's own
  // «Ναι» opens the same sheet, dated before the reading.
  const asking = section === "waiting" && focus?.state === "ask";
  const canArrive = section === "waiting" && focus?.canArrive && !asking;

  return (
    <div className={`${styles.lineWrap} ${section === "later" ? styles.lineQuiet : ""}`}>
      <div className={styles.line}>
        <button type="button" className={styles.lineButton} onClick={() => onOpen(income)} aria-label={t("incomes.list.openCard", { name: income.name })}>
          <span className={styles.lineIcon} aria-hidden>
            {KIND_ICON[income.kind]}
          </span>
          <span className={styles.lineMain}>
            <span className={styles.lineName}>{income.name}</span>
            {tag && section !== "later" && <span className={`${styles.pill} ${styles[`pill_${tag.tone}`]}`}>{tag.text}</span>}
            {section === "later" && focus?.state === "skipped" && <span className={`${styles.pill} ${styles.pill_muted}`}>{tag?.text}</span>}
            <span className={styles.lineSub}>{sub}</span>
          </span>
          {!canArrive && <span className={`${styles.lineAmount} ${section === "arrived" ? styles.amountArrived : ""}`}>{amount}</span>}
        </button>
        {/* With a button the figure sits above it, so the name keeps the width
            a phone has for it rather than being cut to «Ιδιαίτερα μαθήμ…». */}
        {canArrive && focus && (
          <span className={styles.lineAside}>
            <span className={styles.lineAmount}>{amount}</span>
            <Button color="success" outline size="sm" className={styles.arriveButton} onClick={() => onArrive(income, focus)} aria-label={t("incomes.list.arriveFor", { name: income.name })}>
              <FiCheck aria-hidden className="me-1" />
              {t("incomes.arrive")}
            </Button>
          </span>
        )}
        {!canArrive && !asking && <FiChevronRight className="text-body-secondary flex-shrink-0" aria-hidden />}
      </div>

      {asking && focus && (
        <div className={styles.ask} role="group" aria-label={t("incomes.ask.title", { name: income.name })}>
          <div className="fw-semibold mb-1">{t("incomes.ask.title", { name: income.name })}</div>
          <div className="mb-2">{t("incomes.ask.body", { date: lastReadingAt ? f.weekdayDate.format(lastReadingAt) : "" })}</div>
          <div className="d-flex flex-wrap gap-2">
            <Button color="primary" size="sm" onClick={() => onBankAnswer(income, focus, true)}>
              {t("incomes.ask.yes")}
            </Button>
            <Button color="secondary" outline size="sm" onClick={() => onBankAnswer(income, focus, false)}>
              {t("incomes.ask.notYet")}
            </Button>
          </div>
        </div>
      )}

      {focus?.undated && section !== "arrived" && (
        <div className={styles.hint}>
          <button type="button" className={styles.linkButton} onClick={() => onSetDay(income)}>
            {t("incomes.list.setDay")}
          </button>
        </div>
      )}
    </div>
  );
}
