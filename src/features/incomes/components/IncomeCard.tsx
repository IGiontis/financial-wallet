import { useMemo, useState } from "react";
import { Alert, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FiCheck } from "react-icons/fi";
import { DateField } from "../../../shared/components/DateField";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { parseISOMonth, toISODay } from "../../../shared/utils/dates";
import type { OccurrenceOverride } from "../../plannerPage/plannerActuals";
import { KIND_ICON, incomeHistory, incomeRows, isSettled, type ExpectedAmount, type HistoryChip, type Income, type IncomeArrival, type IncomeStatus } from "../incomesUtils";
import { scheduleText, statusTag, type IncomeFormats } from "../incomeText";
import styles from "../css/IncomesPage.module.css";

// Option 4, «Κάρτα ανά έσοδο», as the detail of option 1: tapping an income
// opens its card. The six-month strip shows the pattern without opening
// anything — the salary comes around the 30th and this time came on the 25th;
// the lessons pay 300–340 and stop for the summer — and under it, what can be
// said about this time only, as on the Planner.

export interface IncomeCardProps {
  income: Income;
  statuses: IncomeStatus[];
  expected: ExpectedAmount;
  arrivals: IncomeArrival[];
  accountName?: string;
  formatCurrency: (n: number) => string;
  f: IncomeFormats;
  now: Date;
  /** Set while deletes wait for a connection — see `useOfflineGuard`. */
  deleteLockedReason?: string;
  onClose: () => void;
  onEdit: (income: Income, step?: 1 | 2 | 3) => void;
  onArrive: (income: Income, status: IncomeStatus) => void;
  onSetOverride: (key: string, value: OccurrenceOverride | undefined) => void;
  onDeleteArrival: (transactionId: string) => void;
  onRestore: (income: Income) => void;
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

/** One chip's figure: the day it came, or for a variable income how much. */
function chipValue(chip: HistoryChip, income: Income, t: TFunction, compact: Intl.NumberFormat): string {
  const status = chip.status;
  if (status && isSettled(status) && status.arrival) return income.variable ? compact.format(status.arrival.amount) : String(status.arrival.date.getDate());
  switch (chip.state) {
    case "paused":
      return t("incomes.card.chipPaused");
    case "late":
    case "ask":
      return "!";
    case "skipped":
      return "—";
    case "missed":
      return "✕";
    case "due":
    case "upcoming":
      return "…";
    default:
      return "·";
  }
}

type Saying = { key: string; mode: "menu" | "date" | "amount" };

export default function IncomeCard({
  income,
  statuses,
  expected,
  arrivals,
  accountName,
  formatCurrency,
  f,
  now,
  deleteLockedReason,
  onClose,
  onEdit,
  onArrive,
  onSetOverride,
  onDeleteArrival,
  onRestore,
}: IncomeCardProps) {
  const { t } = useTranslation();
  const { convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const mine = useMemo(() => statuses.filter((s) => s.incomeId === income.id), [statuses, income.id]);
  const chips = useMemo(() => incomeHistory(income, mine, now), [income, mine, now]);
  const row = useMemo(() => incomeRows([income], mine, now)[0], [income, mine, now]);
  const compact = useMemo(() => new Intl.NumberFormat(f.lang, { maximumFractionDigits: 0 }), [f.lang]);
  const archived = income.active === false;

  // What can be said about one time: opened from the focus, or from «επόμενος».
  const [saying, setSaying] = useState<Saying | undefined>();
  const [dateValue, setDateValue] = useState("");
  const [amountValue, setAmountValue] = useState("");

  const focus = row?.focus;
  const next = row?.next;
  const lastSettledChip = [...chips].reverse().find((c) => c.status && isSettled(c.status));

  const facts = [
    `${income.variable ? "≈" : ""}${formatCurrency(expected.amount)}`,
    scheduleText(income, t, f),
    accountName,
    pauseText(income, t, f),
    income.isSalary ? t("incomes.card.mySalary") : undefined,
  ].filter(Boolean);

  const say = (status: IncomeStatus, value: OccurrenceOverride | undefined) => {
    onSetOverride(status.key, value);
    setSaying(undefined);
  };

  const sayingFor = (status: IncomeStatus) => {
    if (!saying || saying.key !== status.key) return null;
    if (saying.mode === "date") {
      return (
        <div className="d-flex gap-2 align-items-start mt-2">
          <div style={{ flex: 1 }}>
            <DateField value={dateValue} onChange={setDateValue} small />
          </div>
          <Button color="primary" size="sm" disabled={!dateValue} onClick={() => say(status, { date: dateValue })}>
            {t("common.save")}
          </Button>
        </div>
      );
    }
    if (saying.mode === "amount") {
      const typed = Number(amountValue.replace(",", "."));
      return (
        <div className="d-flex gap-2 align-items-start mt-2">
          <Input bsSize="sm" type="number" min={0.01} step={0.01} inputMode="decimal" value={amountValue} onChange={(e) => setAmountValue(e.target.value)} aria-label={t("incomes.card.otherAmount")} />
          <Button
            color="primary"
            size="sm"
            disabled={!(typed > 0)}
            onClick={() => say(status, { amount: Math.round((baseCurrency === displayCurrency ? typed : convertToBase(typed)) * 100) / 100 })}
          >
            {t("common.save")}
          </Button>
        </div>
      );
    }
    return (
      <div className={`${styles.choices} mt-2`}>
        {status.canArrive && (
          <button type="button" className={styles.choice} onClick={() => onArrive(income, status)}>
            ✓ {t("incomes.arrive")}
          </button>
        )}
        <button
          type="button"
          className={styles.choice}
          onClick={() => {
            setDateValue(toISODay(status.expectedDate));
            setSaying({ key: status.key, mode: "date" });
          }}
        >
          {t("incomes.card.otherDay")}
        </button>
        <button
          type="button"
          className={styles.choice}
          onClick={() => {
            setAmountValue(String(Number(convert(status.expected).toFixed(2))));
            setSaying({ key: status.key, mode: "amount" });
          }}
        >
          {t("incomes.card.otherAmount")}
        </button>
        <button type="button" className={styles.choice} onClick={() => say(status, { state: "skipped" })}>
          {t("incomes.card.notThisTime")}
        </button>
        <div className="text-body-secondary" style={{ fontSize: 11.5 }}>
          {t("incomes.card.thisTimeOnly")}
        </div>
      </div>
    );
  };

  const occurrenceBlock = (status: IncomeStatus, label: string) => {
    const tag = statusTag(status, t, f);
    const settled = isSettled(status) && status.arrival;
    return (
      <div className={styles.fact}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div>
            {label} · {settled ? f.weekdayDate.format(status.arrival!.date) : f.weekdayDate.format(status.expectedDate)}
          </div>
          <div className="text-body-secondary" style={{ fontSize: 12 }}>
            {tag.text}
            {status.overridden && !settled && ` · ${t("incomes.card.saidThisTime")}`}
          </div>
          {status.state === "found" && (
            <button type="button" className={`${styles.linkButton} mt-1`} style={{ fontSize: 12.5 }} onClick={() => say(status, { state: "waiting" })}>
              {t("incomes.calendar.notThis")}
            </button>
          )}
          {!settled && !archived && (
            <div className="d-flex gap-3 mt-1" style={{ fontSize: 12.5 }}>
              <button type="button" className={styles.linkButton} onClick={() => setSaying(saying?.key === status.key ? undefined : { key: status.key, mode: "menu" })}>
                {t("incomes.card.thisTime")}
              </button>
              {status.overridden && (
                <button type="button" className={styles.linkButton} onClick={() => say(status, undefined)}>
                  {t("incomes.card.undoSaid")}
                </button>
              )}
            </div>
          )}
          {sayingFor(status)}
        </div>
        <div className="d-flex flex-column align-items-end gap-1">
          <span className={`${styles.factAmount} ${settled ? styles.amountArrived : ""}`}>
            {settled ? formatCurrency(status.arrival!.amount) : `${status.approximate ? "≈" : ""}${formatCurrency(status.expected)}`}
          </span>
          {!settled && status.canArrive && status.state !== "ask" && !archived && (
            <Button color="success" outline size="sm" onClick={() => onArrive(income, status)}>
              <FiCheck className="me-1" aria-hidden />
              {t("incomes.arrive")}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose} tag="div" className="w-100">
        <div className="d-flex align-items-center gap-2">
          <span aria-hidden>{KIND_ICON[income.kind]}</span>
          <span className="fw-semibold h6 mb-0">{income.name}</span>
          {!archived && (
            <Button color="link" size="sm" className="p-0 ms-2" onClick={() => onEdit(income)}>
              {t("incomes.card.edit")}
            </Button>
          )}
        </div>
        <div className="text-body-secondary fw-normal mt-1" style={{ fontSize: 12.5 }}>
          {facts.join(" · ")}
        </div>
      </ModalHeader>
      <ModalBody>
        {archived && (
          <Alert color="secondary" className="py-2 d-flex justify-content-between align-items-center gap-2" style={{ fontSize: 13 }}>
            {t("incomes.card.archived")}
            <Button size="sm" color="primary" outline onClick={() => onRestore(income)}>
              {t("incomes.card.restore")}
            </Button>
          </Alert>
        )}

        {income.day === undefined && income.frequency !== "weekly" && !archived && (
          <Alert color="warning" className="py-2" style={{ fontSize: 13 }}>
            {t("incomes.card.undated")}{" "}
            <button type="button" className={styles.linkButton} onClick={() => onEdit(income, 2)}>
              {t("incomes.list.setDay")}
            </button>
          </Alert>
        )}

        <div className="fw-semibold mb-2" style={{ fontSize: 13 }}>
          {income.variable ? t("incomes.card.historyAmounts") : income.frequency === "monthly" ? t("incomes.card.historyDays") : t("incomes.card.historyTimes")}
        </div>
        <div className={styles.strip}>
          {chips.map((chip) => {
            const status = chip.status;
            const settled = !!status && isSettled(status);
            const cls = [
              styles.chip,
              settled ? styles.chipArrived : "",
              chip.state === "late" || chip.state === "ask" ? styles.chipLate : "",
              chip.state === "paused" ? styles.chipPaused : "",
              !settled && chip.state !== "late" && chip.state !== "ask" ? styles.chipQuiet : "",
              chip === lastSettledChip ? styles.chipLatest : "",
            ].join(" ");
            const label = income.frequency === "monthly" ? f.monthShort.format(chip.date) : f.dayMonth.format(chip.date);
            return (
              <div key={chip.key} className={cls} title={status ? statusTag(status, t, f).text : chip.state === "paused" ? t("incomes.card.chipPaused") : ""}>
                <span className={styles.chipLabel}>{label}</span>
                <span className={styles.chipValue}>{chipValue(chip, income, t, compact)}</span>
              </div>
            );
          })}
        </div>
        {income.variable && (
          <div className="text-body-secondary mt-2" style={{ fontSize: 12 }}>
            {expected.estimated
              ? t("incomes.card.estimate", { count: expected.recent.length })
              : t("incomes.card.mean", { amount: formatCurrency(expected.amount), list: expected.recent.map((n) => formatCurrency(n)).join(" + ") })}
          </div>
        )}

        <div className="mt-3">
          {focus && occurrenceBlock(focus, isSettled(focus) ? t("incomes.card.came") : t("incomes.card.expected"))}
          {next && occurrenceBlock(next, t("incomes.card.next"))}
        </div>

        {arrivals.length > 0 && (
          <div className="mt-3">
            <div className="fw-semibold mb-1" style={{ fontSize: 13 }}>
              {t("incomes.card.records")}
            </div>
            {arrivals.slice(0, 6).map((arrival) => (
              <div key={arrival.due} className={styles.fact}>
                <div style={{ minWidth: 0 }}>
                  <div>{f.weekdayDate.format(arrival.date)}</div>
                  <div className="text-body-secondary" style={{ fontSize: 12 }}>
                    {t("incomes.card.recordFor", { month: f.monthYearShort.format(new Date(`${arrival.due}T00:00:00`)) })}
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className={`${styles.factAmount} ${styles.amountArrived}`}>{formatCurrency(arrival.amount)}</span>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    disabled={!!deleteLockedReason}
                    title={deleteLockedReason}
                    onClick={() => arrival.transactions.forEach((tx) => onDeleteArrival(tx.id))}
                    aria-label={t("incomes.card.undoRecordFor", { date: f.weekdayDate.format(arrival.date) })}
                  >
                    {t("incomes.card.undoRecord")}
                  </Button>
                </div>
              </div>
            ))}
            <div className="text-body-secondary mt-1" style={{ fontSize: 11.5 }}>
              {deleteLockedReason ?? t("incomes.card.recordsHint")}
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
