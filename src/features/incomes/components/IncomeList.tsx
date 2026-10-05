import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FiCalendar, FiCheck, FiCreditCard, FiEdit2, FiInfo, FiPauseCircle, FiRepeat, FiRotateCcw, FiSliders, FiTrash2 } from "react-icons/fi";
import type { IconType } from "react-icons";
import { MENU_DIVIDER, RowMenu, type RowMenuEntry } from "../../../shared/components/RowMenu";
import { currentPause } from "../../bills/billsUtils";
import { KIND_ICON, isActiveIncome, isSettled, type Income, type IncomeRow, type IncomeStatus, type MonthSummary, type RowSection } from "../incomesUtils";
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
  onEdit: (income: Income) => void;
  onRestore: (income: Income) => void;
  /** Asks first. */
  onDelete: (income: Income) => void;
  /** «Αυτή τη φορά…»: another day, another amount, or not at all. */
  onThisTime: (income: Income, status: IncomeStatus) => void;
  /** Whether there is an «Ήρθε» to take back, and taking it back (asks first). */
  canUndoArrival: (income: Income) => boolean;
  onUndoArrival: (income: Income) => void;
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

/**
 * The ⋮ on a row: everything that can be done to the income without opening
 * its card first, delete last and in red — as on a goal. What is said about
 * one time lives here too, since the card is for reading.
 */
function lineMenu(income: Income, t: TFunction, actions: IncomeListActions, options: { arrive?: () => void; thisTime?: IncomeStatus } = {}): RowMenuEntry[] {
  const archived = !isActiveIncome(income);
  const { thisTime, arrive } = options;
  return [
    ...(arrive ? [{ label: t("incomes.arrive"), icon: <FiCheck aria-hidden />, onSelect: arrive }] : []),
    { label: t("incomes.actions.details"), icon: <FiInfo aria-hidden />, onSelect: () => actions.onOpen(income) },
    ...(archived
      ? [{ label: t("incomes.card.restore"), icon: <FiRotateCcw aria-hidden />, onSelect: () => actions.onRestore(income) }]
      : [
          { label: t("common.edit"), icon: <FiEdit2 aria-hidden />, onSelect: () => actions.onEdit(income) },
          ...(thisTime ? [{ label: t("incomes.actions.thisTime"), icon: <FiSliders aria-hidden />, onSelect: () => actions.onThisTime(income, thisTime) }] : []),
          ...(actions.canUndoArrival(income) ? [{ label: t("incomes.actions.undoArrival"), icon: <FiRotateCcw aria-hidden />, onSelect: () => actions.onUndoArrival(income) }] : []),
        ]),
    MENU_DIVIDER,
    { label: t("common.delete"), icon: <FiTrash2 aria-hidden />, onSelect: () => actions.onDelete(income), danger: true },
  ];
}

interface Tag {
  icon: IconType;
  text: string;
}

/** A row's facts as small chips rather than one run of grey text. */
function Tags({ pill, tags }: { pill?: { text: string; tone: string }; tags: Tag[] }) {
  return (
    <span className={styles.tags}>
      {pill && <span className={`${styles.pill} ${styles[`pill_${pill.tone}`]}`}>{pill.text}</span>}
      {tags.map(({ icon: Icon, text }) => (
        <span key={text} className={styles.tag}>
          <Icon aria-hidden />
          {text}
        </span>
      ))}
    </span>
  );
}

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
                      <Tags tags={[{ icon: FiRepeat, text: shortSchedule(income, t, f) }]} />
                    </span>
                    <span className={styles.lineAmount}>{formatCurrency(income.amount)}</span>
                  </button>
                  <RowMenu label={t("incomes.actions.menu", { name: income.name })} className={styles.lineMenu} entries={lineMenu(income, t, props)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IncomeLine(props: ListProps & { row: IncomeRow }) {
  const { row, formatCurrency, accountName, lastReadingAt, f, now, onOpen, onArrive, onBankAnswer, onSetDay } = props;
  const { t } = useTranslation();
  const { income, focus, section, next } = row;
  const tag = focus ? statusTag(focus, t, f) : undefined;
  const account = accountName(income.accountId);
  const approx = focus?.approximate ? "≈" : "";
  const pause = currentPause(income, now);

  const tags: Tag[] = [];
  let amount: string;
  if (section === "arrived") {
    amount = formatCurrency(sum(row.settled.map((s) => s.arrival?.amount ?? 0)));
    tags.push({ icon: FiRepeat, text: shortSchedule(income, t, f) });
    if (next) tags.push({ icon: FiCalendar, text: t("incomes.list.next", { date: f.weekdayDate.format(next.expectedDate) }) });
  } else if (section === "waiting" && focus) {
    amount = `${approx}${formatCurrency(focus.expected)}`;
    // Asked about one not due yet — next month's rent inside its ten days — is
    // "for" its day, not "was for" it.
    if (focus.state === "late" || focus.state === "ask") {
      tags.push({ icon: FiCalendar, text: t(focus.date < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? "incomes.list.wasFor" : "incomes.list.dueOn", { date: f.weekdayDate.format(focus.date) }) });
    } else {
      tags.push({ icon: FiRepeat, text: shortSchedule(income, t, f) });
    }
    if (income.variable) tags.push({ icon: FiRepeat, text: t("incomes.list.variableMean", { amount: formatCurrency(focus.expected) }) });
    if (account) tags.push({ icon: FiCreditCard, text: account });
    if (row.open.length > 1) tags.push({ icon: FiCalendar, text: t("incomes.list.moreOpen", { count: row.open.length - 1 }) });
  } else {
    amount = `${income.variable ? "≈" : ""}${formatCurrency(focus?.expected ?? income.amount)}`;
    const upcoming = focus && !isSettled(focus) && focus.state !== "skipped" && focus.state !== "missed" ? focus : next;
    if (pause?.state === "paused" && pause.to) tags.push({ icon: FiPauseCircle, text: t("incomes.list.pausedUntil", { month: f.monthYearShort.format(pause.to) }) });
    else if (pause?.state === "ended") tags.push({ icon: FiPauseCircle, text: t("incomes.list.stopped") });
    else if (upcoming) tags.push({ icon: FiCalendar, text: t("incomes.list.nextOn", { date: f.weekdayDate.format(upcoming.expectedDate) }) });
    else tags.push({ icon: FiRepeat, text: shortSchedule(income, t, f) });
  }
  // The time «Αυτή τη φορά…» speaks about: this one while it is open (a "not
  // this time" included, so it can be taken back), else the next.
  const thisTime = focus && !isSettled(focus) ? focus : next;

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
            <Tags pill={tag && (section !== "later" || focus?.state === "skipped") ? tag : undefined} tags={tags} />
          </span>
          {!canArrive && <span className={`${styles.lineAmount} ${section === "arrived" ? styles.amountArrived : ""}`}>{amount}</span>}
        </button>
        {/* With a button the figure sits above it, so the name keeps the width
            a phone has for it rather than being cut to «Ιδιαίτερα μαθήμ…». */}
        {canArrive && focus && (
          <span className={styles.lineAside}>
            <span className={styles.lineAmount}>{amount}</span>
            <Button color="success" size="sm" className={styles.arriveButton} onClick={() => onArrive(income, focus)} aria-label={t("incomes.list.arriveFor", { name: income.name })}>
              <FiCheck aria-hidden className="me-1" />
              {t("incomes.arrive")}
            </Button>
          </span>
        )}
        <RowMenu
          label={t("incomes.actions.menu", { name: income.name })}
          className={styles.lineMenu}
          entries={lineMenu(income, t, props, { arrive: canArrive && focus ? () => onArrive(income, focus) : undefined, thisTime })}
        />
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
