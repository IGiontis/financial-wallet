import { useMemo } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FiCalendar, FiCheck, FiCreditCard, FiEdit2, FiPauseCircle, FiRepeat, FiRotateCcw } from "react-icons/fi";
import type { IconType } from "react-icons";
import { parseISOMonth } from "../../../shared/utils/dates";
import { KIND_ICON, incomeHistory, incomeRows, isSettled, type ExpectedAmount, type HistoryChip, type Income, type IncomeArrival, type IncomeStatus } from "../incomesUtils";
import { scheduleText, statusTag, type IncomeFormats } from "../incomeText";
import styles from "../css/IncomesPage.module.css";
import { DeleteButton } from "../../../shared/components/DeleteButton";

// Option 4, «Κάρτα ανά έσοδο»: what an income is, to read. How often it comes,
// how much, where the money lands and when next; then six months of it in
// colour, and the «Ήρθε» records. Nothing in the body is a control — changing
// the income is «Επεξεργασία», and what is said about one time lives on the
// row's ⋮ («Αυτή τη φορά…»).
//
// The buttons are split as on a bill: the delete on its own on the left, away
// from the two everyday ones on the right.

export interface IncomeCardProps {
  income: Income;
  statuses: IncomeStatus[];
  expected: ExpectedAmount;
  arrivals: IncomeArrival[];
  accountName?: string;
  formatCurrency: (n: number) => string;
  f: IncomeFormats;
  now: Date;
  onClose: () => void;
  /** Left out where the income is not changed from here — no button then. */
  onEdit?: (income: Income) => void;
  /** The edit button's words, where it leads elsewhere («Αλλαγή στα Έσοδα»). */
  editLabel?: string;
  onArrive: (income: Income, status: IncomeStatus) => void;
  onRestore?: (income: Income) => void;
  /** Asks first. Left out where nothing is deleted from here. */
  onDelete?: (income: Income) => void;
}

function pauseText(income: Income, t: TFunction, f: IncomeFormats): string | undefined {
  const pause = income.pause;
  if (!pause) return undefined;
  const from = parseISOMonth(pause.from);
  const to = pause.to ? parseISOMonth(pause.to) : null;
  if (!from) return undefined;
  if (!to) return t("incomes.card.stopsFrom", { month: f.monthYearShort.format(from) });
  if (pause.yearly) return t("incomes.card.pauseYearly", { from: f.monthShort.format(from), to: f.monthShort.format(to) });
  return t("incomes.card.pauseOnce", { from: f.monthYearShort.format(from), to: f.monthYearShort.format(to) });
}

type ChipTone = "arrived" | "late" | "ask" | "missed" | "skipped" | "paused" | "coming" | "none";

/** One month (or time) of the history: its colour, and the word or figure on it. */
function chipLook(chip: HistoryChip, income: Income, t: TFunction, compact: Intl.NumberFormat): { tone: ChipTone; value: string } {
  const status = chip.status;
  if (status && isSettled(status) && status.arrival) {
    return { tone: "arrived", value: income.variable ? compact.format(status.arrival.amount) : String(status.arrival.date.getDate()) };
  }
  switch (chip.state) {
    case "late":
      return { tone: "late", value: t("incomes.card.chipLate") };
    case "ask":
      return { tone: "ask", value: "?" };
    case "missed":
      return { tone: "missed", value: t("incomes.card.chipMissed") };
    case "skipped":
      return { tone: "skipped", value: t("incomes.card.chipSkipped") };
    case "paused":
      return { tone: "paused", value: t("incomes.card.chipPaused") };
    case "due":
    case "upcoming":
      return { tone: "coming", value: status ? String(status.expectedDate.getDate()) : "…" };
    default:
      return { tone: "none", value: "" };
  }
}

const CHIP_CLASS: Record<ChipTone, string> = {
  arrived: styles.chipArrived,
  late: styles.chipLate,
  ask: styles.chipAsk,
  missed: styles.chipMissed,
  skipped: styles.chipSkipped,
  paused: styles.chipPaused,
  coming: styles.chipComing,
  none: styles.chipNone,
};

function Fact({ icon: Icon, label, value, sub }: { icon: IconType; label: string; value: string; sub?: string }) {
  return (
    <div className={styles.readRow}>
      <span className={styles.readIcon} aria-hidden>
        <Icon />
      </span>
      <span className={styles.readLabel}>{label}</span>
      <span className={styles.readValue}>
        {value}
        {sub && <span className={styles.readSub}>{sub}</span>}
      </span>
    </div>
  );
}

export default function IncomeCard({ income, statuses, expected, arrivals, accountName, formatCurrency, f, now, onClose, onEdit, editLabel, onArrive, onRestore, onDelete }: IncomeCardProps) {
  const { t } = useTranslation();
  const mine = useMemo(() => statuses.filter((s) => s.incomeId === income.id), [statuses, income.id]);
  const chips = useMemo(() => incomeHistory(income, mine, now), [income, mine, now]);
  const row = useMemo(() => incomeRows([income], mine, now)[0], [income, mine, now]);
  const compact = useMemo(() => new Intl.NumberFormat(f.lang, { maximumFractionDigits: 0 }), [f.lang]);
  const archived = income.active === false;

  const focus = row?.focus;
  // The time «Ήρθε» records: this one while it is open, else the next one —
  // always there, so a salary paid early can be marked the day it lands. The
  // sheet it opens asks for the day and the figure and shows them before
  // anything is written.
  const open = archived ? undefined : focus && !isSettled(focus) && focus.state !== "skipped" ? focus : row?.next && !isSettled(row.next) ? row.next : undefined;
  const upcoming = focus && !isSettled(focus) && focus.state !== "skipped" && focus.state !== "missed" ? focus : row?.next;
  const tag = focus ? statusTag(focus, t, f) : undefined;

  const amount = income.variable ? `≈ ${formatCurrency(expected.amount)}` : formatCurrency(income.amount);
  const amountSub = income.variable
    ? expected.estimated
      ? t("incomes.card.estimate", { count: expected.recent.length })
      : t("incomes.card.mean", { amount: formatCurrency(expected.amount), list: expected.recent.map((n) => formatCurrency(n)).join(" + ") })
    : t("incomes.card.fixed");
  const pause = pauseText(income, t, f);

  const tones = new Set(chips.map((chip) => chipLook(chip, income, t, compact).tone));
  const legend = (["arrived", "late", "missed", "coming"] as const).filter((tone) => tones.has(tone));

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose} tag="div" className="w-100">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span aria-hidden>{KIND_ICON[income.kind]}</span>
          <span className="fw-semibold h6 mb-0">{income.name}</span>
          {income.isSalary && <span className={`${styles.pill} ${styles.pill_muted}`}>{t("incomes.card.mySalary")}</span>}
        </div>
        {tag && !archived && <span className={`${styles.pill} ${styles[`pill_${tag.tone}`]} mt-1 d-inline-block`}>{tag.text}</span>}
      </ModalHeader>

      <ModalBody>
        {archived && (
          <p className="text-body-secondary mb-3" style={{ fontSize: 13 }}>
            {t("incomes.card.archived")}
          </p>
        )}

        {income.day === undefined && income.frequency !== "weekly" && !archived && (
          <p className="mb-3" style={{ fontSize: 13, color: "var(--color-goal-text)" }}>
            {t("incomes.card.undated")}
          </p>
        )}

        <div className={styles.readCard}>
          <Fact icon={FiRepeat} label={t("incomes.card.howOften")} value={scheduleText(income, t, f)} />
          <Fact icon={FiCheck} label={t("incomes.card.howMuch")} value={amount} sub={amountSub} />
          <Fact icon={FiCreditCard} label={t("incomes.card.where")} value={accountName ?? t("incomes.card.noAccount")} />
          {upcoming && !archived && (
            <Fact
              icon={FiCalendar}
              // A late one is not "next": it is the one still owed.
              label={upcoming.state === "late" || upcoming.state === "ask" ? t("incomes.card.wasDue") : t("incomes.card.nextTime")}
              value={f.weekdayDate.format(upcoming.expectedDate)}
              sub={statusTag(upcoming, t, f).text}
            />
          )}
          {pause && <Fact icon={FiPauseCircle} label={t("incomes.card.pause")} value={pause} />}
        </div>

        <div className="fw-semibold mt-3 mb-2" style={{ fontSize: 13 }}>
          {income.variable ? t("incomes.card.historyAmounts") : income.frequency === "monthly" ? t("incomes.card.historyDays") : t("incomes.card.historyTimes")}
        </div>
        <div className={styles.strip}>
          {chips.map((chip) => {
            const look = chipLook(chip, income, t, compact);
            const label = income.frequency === "monthly" ? f.monthShort.format(chip.date) : f.dayMonthShort.format(chip.date);
            return (
              <div key={chip.key} className={`${styles.chip} ${CHIP_CLASS[look.tone]}`} title={chip.status ? statusTag(chip.status, t, f).text : look.value}>
                <span className={styles.chipLabel}>{label}</span>
                <span className={styles.chipValue}>{look.value}</span>
              </div>
            );
          })}
        </div>
        {legend.length > 0 && (
          <div className={styles.chipLegend} aria-hidden>
            {legend.map((tone) => (
              <span key={tone}>
                <span className={`${styles.chipSwatch} ${CHIP_CLASS[tone]}`} />
                {t(`incomes.card.legend.${tone}`)}
              </span>
            ))}
          </div>
        )}

        {arrivals.length > 0 && (
          <div className="mt-3">
            <div className="fw-semibold mb-1" style={{ fontSize: 13 }}>
              {t("incomes.card.records")}
            </div>
            <div className={styles.readCard}>
              {arrivals.slice(0, 6).map((arrival) => (
                <div key={arrival.due} className={styles.recordRow}>
                  <span>
                    <span className="d-block">{f.weekdayDate.format(arrival.date)}</span>
                    <span className={styles.readSub}>{t("incomes.card.recordFor", { month: f.monthYearShort.format(new Date(`${arrival.due}T00:00:00`)) })}</span>
                  </span>
                  <span className={`${styles.factAmount} ${styles.amountArrived}`}>{formatCurrency(arrival.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter className="justify-content-between">
        {/* The word only where it fits: on a phone the three would not share a row. */}
        {onDelete ? (
          <DeleteButton opensConfirm wordFromSm onClick={() => onDelete(income)} />
        ) : (
          <span />
        )}
        <div className="d-flex gap-2">
          {archived ? (
            onRestore && (
              <Button color="primary" onClick={() => onRestore(income)}>
                <FiRotateCcw className="me-1" aria-hidden />
                {t("incomes.card.restore")}
              </Button>
            )
          ) : (
            <>
              {onEdit && (
                <Button color="secondary" outline onClick={() => onEdit(income)}>
                  <FiEdit2 className="me-1" aria-hidden />
                  {editLabel ?? t("common.edit")}
                </Button>
              )}
              {open && (
                <Button color="success" onClick={() => onArrive(income, open)}>
                  <FiCheck className="me-1" aria-hidden />
                  {t("incomes.arrive")}
                </Button>
              )}
            </>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}
