import { useMemo, useState } from "react";
import { getDaysInMonth } from "date-fns";
import { Alert, Button, Col, Container, Input, InputGroup, InputGroupText, Row, Spinner } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCheckCircle, FiCheckSquare, FiClock, FiLock, FiPlus, FiSquare, FiX } from "react-icons/fi";

import { useTransactions } from "../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../budget/useInvestments";
import { useBills } from "../bills/useBills";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { isHardDeadline } from "../bills/billsUtils";
import { asHorizon, buildPlan, detectSalary, PLANNER_HORIZONS, type BudgetLine, type PlannerEvent, type PlannerHorizon, type PlanRow } from "./plannerUtils";
import { BalanceLine } from "./BalanceLine";
import segmented from "../../shared/css/Segmented.module.css";
import styles from "./css/PlannerPage.module.css";

const VERDICT_STYLE = {
  ok: { className: styles.verdictOk, Icon: FiCheckCircle },
  tight: { className: styles.verdictTight, Icon: FiClock },
  short: { className: styles.verdictShort, Icon: FiAlertTriangle },
} as const;

const newId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A forward budget: what arrives, what leaves, over the next one to twelve
 * months — and whether the first covers the second.
 *
 * Nothing here is inferred from what has already been spent. Bills and goals
 * come from the app because they are commitments already made; everything else
 * is the user's own estimate of the months ahead, and every row can be switched
 * off to ask "and if I dropped this?".
 */
export function PlannerPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const { data: transactions = [], isLoading: txLoading, isError } = useTransactions();
  const { data: goals = [], isLoading: goalLoading } = useInvestmentGoals();
  const { data: bills = [], isLoading: billLoading } = useBills();
  const { format: formatCurrency, baseCurrency } = useCurrencyConverter();

  // One clock reading for the visit, so the projection doesn't shift mid-render.
  const [now] = useState(() => new Date());

  // Everything below is read back from localStorage, where a value written by an
  // older version of this page can still be sitting. None of these are trusted
  // on their type alone — one stale horizon name was enough to take the whole
  // page down with an invalid date.
  const [storedHorizon, setHorizon] = useLocalStorage<PlannerHorizon>("planner-horizon", "1m");
  const [openingInput, setOpeningInput] = useLocalStorage("planner-opening", "");
  const [storedSalary, setSalaryInput] = useLocalStorage("planner-salary", { amount: "", day: "" });
  const [storedLines, setLines] = useLocalStorage<BudgetLine[]>("planner-lines", []);
  const [storedSkipped, setSkipped] = useLocalStorage<string[]>("planner-skip", []);

  const horizon = asHorizon(storedHorizon);
  // Memoised because it feeds the plan: a fresh object each render would
  // rebuild the whole projection on every keystroke anywhere on the page.
  const salaryInput = useMemo(() => ({ amount: String(storedSalary?.amount ?? ""), day: String(storedSalary?.day ?? "") }), [storedSalary]);
  const lines = useMemo(
    () => (Array.isArray(storedLines) ? storedLines.filter((l): l is BudgetLine => !!l && typeof l.id === "string" && Number.isFinite(l.amount)) : []),
    [storedLines],
  );
  const skipped = useMemo(() => (Array.isArray(storedSkipped) ? storedSkipped.filter((s): s is string => typeof s === "string") : []), [storedSkipped]);
  const [selectedDay, setSelectedDay] = useState(-1);
  const [draft, setDraft] = useState<{ kind: "income" | "expense"; label: string; amount: string } | null>(null);

  const skipIds = useMemo(() => new Set(skipped), [skipped]);

  // Detection only ever fills the field in; the figure the plan uses is the one
  // left in the box.
  const detectedSalary = useMemo(() => detectSalary(transactions, now), [transactions, now]);

  const salary = useMemo(() => {
    const typedAmount = parseFloat(salaryInput.amount);
    const typedDay = parseInt(salaryInput.day, 10);

    const amount = Number.isFinite(typedAmount) && typedAmount > 0 ? typedAmount : detectedSalary?.amount;
    const dayOfMonth = Number.isFinite(typedDay) && typedDay >= 1 && typedDay <= 31 ? typedDay : detectedSalary?.dayOfMonth;

    return amount && dayOfMonth ? { amount, dayOfMonth, occurrences: detectedSalary?.occurrences ?? 0 } : undefined;
  }, [salaryInput, detectedSalary]);

  const salaryIsManual = salaryInput.amount.trim() !== "" || salaryInput.day.trim() !== "";

  const plan = useMemo(
    () => buildPlan({ bills, goals, lines, salary, openingBalance: parseFloat(openingInput) || 0, skipIds, horizon, now }),
    [bills, goals, lines, salary, openingInput, skipIds, horizon, now],
  );

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }), [lang]);
  // Greek inflects month names: `{ month: "long" }` alone yields the genitive
  // ("Αυγούστου"), which is right inside a date and wrong as a heading. Adding
  // the year switches Intl to the standalone nominative, so the month part is
  // pulled back out of that rather than formatted on its own.
  const monthNameFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }), [lang]);
  const monthName = useMemo(() => (date: Date) => monthNameFmt.formatToParts(date).find((part) => part.type === "month")?.value ?? "", [monthNameFmt]);

  // Grouped by calendar month, so a multi-month window reads as months rather
  // than one long undivided list. Each header carries that month's outgoings —
  // the figure you would otherwise be adding up by eye.
  const eventMonths = useMemo(() => {
    const groups: { key: string; label: string; outgoing: number; events: PlannerEvent[] }[] = [];

    for (const event of plan.events) {
      const key = `${event.date.getFullYear()}-${event.date.getMonth()}`;
      const label = event.date.getFullYear() === now.getFullYear() ? monthName(event.date) : `${monthName(event.date)} ${event.date.getFullYear()}`;
      const last = groups[groups.length - 1];

      if (last?.key === key) last.events.push(event);
      else groups.push({ key, label, outgoing: 0, events: [event] });

      if (event.amount < 0) groups[groups.length - 1].outgoing -= event.amount;
    }

    return groups;
  }, [plan.events, monthName, now]);

  // The budget lines accrue by the day rather than landing on a date, so the
  // "nothing happens here" days still have a figure to show.
  const monthlyLineNet = lines.filter((l) => !skipIds.has(l.id)).reduce((sum, l) => sum + (l.kind === "income" ? l.amount : -l.amount), 0);

  const rowsOf = (match: (row: PlanRow) => boolean) => plan.rows.filter(match);
  const incomeRows = rowsOf((r) => r.source === "salary" || (r.source === "line" && (r.perMonth ?? 0) > 0));
  const billRows = rowsOf((r) => r.source === "bill");
  const goalRows = rowsOf((r) => r.source === "goal");
  const budgetRows = rowsOf((r) => r.source === "line" && (r.perMonth ?? 0) < 0);

  // Written from the sanitised copies rather than through a functional update,
  // so a malformed stored value is replaced by a clean one instead of being
  // spread back into the next write.
  const toggleRow = (id: string) => setSkipped(skipped.includes(id) ? skipped.filter((s) => s !== id) : [...skipped, id]);
  const setAll = (rows: PlanRow[], on: boolean) => {
    const ids = rows.map((r) => r.id);
    setSkipped(on ? skipped.filter((s) => !ids.includes(s)) : Array.from(new Set([...skipped, ...ids])));
  };

  const editLine = (id: string, patch: Partial<BudgetLine>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setLines(lines.filter((l) => l.id !== id));

  const commitDraft = () => {
    if (!draft) return;
    const amount = parseFloat(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setLines([...lines, { id: newId(), label: draft.label.trim() || t("planner.lineFallbackName"), amount, kind: draft.kind }]);
    setDraft(null);
  };

  const breaksOnIndex = plan.breaksOn ? plan.points.findIndex((p) => p.date.getTime() === plan.breaksOn!.getTime()) : -1;
  const selectedPoint = selectedDay >= 0 && selectedDay < plan.points.length ? plan.points[selectedDay] : undefined;

  if (txLoading || goalLoading || billLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <Container fluid className="py-4">
        <Alert color="danger" className="small">
          {t("common.failedToLoad")}
        </Alert>
      </Container>
    );
  }

  const { className: verdictClass, Icon: VerdictIcon } = VERDICT_STYLE[plan.verdict];
  const headline = plan.verdict === "short" ? t("planner.verdictShort") : plan.verdict === "tight" ? t("planner.verdictTight") : t("planner.verdictOk");
  const amount = plan.verdict === "short" ? plan.shortfall : plan.surplus;

  // "Tight" means the months add up but the running total dips below zero on the
  // way, so the subline has to name the day and how deep — that is the whole
  // difference between it and a straight yes.
  const subline =
    plan.verdict === "tight" && plan.breaksOn
      ? plan.breakingEvent
        ? t("planner.dipsOnBill", { date: dateFmt.format(plan.breaksOn), name: plan.breakingEvent.label, amount: formatCurrency(plan.dip) })
        : t("planner.dipsOn", { date: dateFmt.format(plan.breaksOn), amount: formatCurrency(plan.dip) })
      : t("planner.untilDate", { date: dateFmt.format(plan.end), months: plan.months });

  const eventLabel = (event: PlannerEvent) => (event.kind === "income" ? t("planner.salaryLabel") : event.label);

  const renderEvent = (event: PlannerEvent, index: number) => {
    const source = event.billId ? bills.find((b) => b.id === event.billId) : undefined;
    const isBreaking = plan.breakingEvent === event;
    const tone = isBreaking ? "var(--color-expense)" : event.amount > 0 ? "var(--color-income)" : undefined;

    return (
      <div key={`${event.kind}-${event.billId ?? event.label}-${index}`} className={styles.eventRow}>
        <span className={styles.eventDate} style={{ color: tone }}>
          {event.overdue ? t("planner.now") : dateFmt.format(event.date)}
        </span>
        <span className={styles.eventName}>
          <span className={styles.eventTitle} style={{ color: tone }}>
            {eventLabel(event)}
            {source && isHardDeadline(source) && <FiLock size={11} className="ms-1" style={{ verticalAlign: "-1px", color: "var(--color-expense)" }} title={t("bills.strictHint")} />}
          </span>
          {/* Only bills with real grace get this line — and it names the actual
              last day, since "can wait" without a date is not something you can
              plan around. */}
          {event.graceDays !== undefined && event.graceDays > 0 && event.deadline && (
            <span className={styles.eventNote}>{t("planner.canWaitUntil", { date: dateFmt.format(event.deadline), days: event.graceDays })}</span>
          )}
        </span>
        <span className={styles.eventAmount} style={{ color: tone }}>
          {event.amount > 0 ? "+" : "−"}
          {formatCurrency(Math.abs(event.amount))}
        </span>
      </div>
    );
  };

  /** A row of the plan with its switch. `extra` is the editable half, if any. */
  const renderRow = (row: PlanRow, extra?: React.ReactNode) => {
    // The salary row has no document behind it, so its label is an internal id
    // rather than something a screen reader should ever read out.
    const title = row.source === "salary" ? t("planner.salaryLabel") : row.label;
    const hint =
      row.occurrences !== undefined
        ? t("planner.timesCount", { times: row.occurrences })
        : t("planner.perMonthShort", { amount: formatCurrency(Math.abs(row.perMonth ?? 0)) });

    return (
      <div key={row.id} className={`${styles.planRow} ${row.enabled ? "" : styles.planRowOff}`}>
        <button type="button" className={styles.planToggle} onClick={() => toggleRow(row.id)} aria-pressed={row.enabled} aria-label={title}>
          {row.enabled ? <FiCheckSquare size={14} style={{ color: "var(--bs-primary)" }} /> : <FiSquare size={14} />}
        </button>

        <span className={styles.planName}>
          <span className={styles.planTitle}>{title}</span>
          <span className={styles.planHint}>{hint}</span>
        </span>

        {extra}

        <span className={styles.planAmount} style={{ color: row.enabled ? (row.total > 0 ? "var(--color-income)" : "var(--color-expense)") : undefined }}>
          {row.enabled ? `${row.total > 0 ? "+" : "−"}${formatCurrency(Math.abs(row.total))}` : t("planner.off")}
        </span>
      </div>
    );
  };

  const renderLineRow = (row: PlanRow) => {
    const line = lines.find((l) => l.id === row.id);
    if (!line) return null;

    return (
      <div key={row.id}>
        {renderRow(row)}
        <div className={styles.lineEdit}>
          <Input
            bsSize="sm"
            value={line.label}
            onChange={(e) => editLine(line.id, { label: e.target.value })}
            aria-label={t("planner.lineName")}
            placeholder={t("planner.lineNamePlaceholder")}
          />
          <InputGroup size="sm" style={{ width: 118, flexShrink: 0 }}>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={String(line.amount)}
              onChange={(e) => editLine(line.id, { amount: parseFloat(e.target.value) || 0 })}
              aria-label={t("planner.lineAmount")}
            />
            <InputGroupText>{t("planner.perMonthSuffix")}</InputGroupText>
          </InputGroup>
          <button type="button" className={styles.lineRemove} onClick={() => removeLine(line.id)} aria-label={t("common.delete")}>
            <FiX size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderDraft = (kind: "income" | "expense") =>
    draft?.kind === kind ? (
      <div className={styles.lineEdit}>
        <Input bsSize="sm" autoFocus value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={t("planner.lineNamePlaceholder")} aria-label={t("planner.lineName")} />
        <InputGroup size="sm" style={{ width: 118, flexShrink: 0 }}>
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && commitDraft()}
            placeholder="0"
            aria-label={t("planner.lineAmount")}
          />
          <InputGroupText>{t("planner.perMonthSuffix")}</InputGroupText>
        </InputGroup>
        <Button color="primary" size="sm" style={{ fontSize: 11, padding: "2px 8px" }} onClick={commitDraft}>
          {t("common.save")}
        </Button>
      </div>
    ) : (
      <button type="button" className={styles.addLine} onClick={() => setDraft({ kind, label: "", amount: "" })}>
        <FiPlus size={13} /> {kind === "income" ? t("planner.addIncomeLine") : t("planner.addExpenseLine")}
      </button>
    );

  const sectionHeader = (label: string, rows: PlanRow[]) => (
    <div className={styles.sectionHead}>
      <span>{label}</span>
      {rows.length > 1 && (
        <button type="button" className={styles.sectionToggle} onClick={() => setAll(rows, !rows.every((r) => r.enabled))}>
          {rows.every((r) => r.enabled) ? t("planner.skipAll") : t("planner.includeAll")}
        </button>
      )}
    </div>
  );

  return (
    <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex justify-content-between align-items-start mb-3 gap-2 flex-wrap">
        <div style={{ minWidth: 0 }}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("planner.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("planner.subtitle")}</p>
        </div>

        <div className={segmented.group} role="group" aria-label={t("planner.horizonLabel")}>
          {PLANNER_HORIZONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`${segmented.item} ${horizon === option ? segmented.active : ""}`}
              onClick={() => {
                setHorizon(option);
                setSelectedDay(-1);
              }}
            >
              {t(`planner.horizon.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <Row className="g-3">
        <Col xs={12} lg={7}>
          {/* ── The answer ── */}
          <div className={`${styles.verdict} ${verdictClass} mb-3`}>
            <div className={styles.verdictHeadline}>
              <VerdictIcon size={18} aria-hidden />
              {headline}
            </div>
            <div className={styles.verdictAmount}>{formatCurrency(amount)}</div>
            <div className={styles.verdictSub}>{subline}</div>
          </div>

          {/* ── The sum, in one line ── */}
          <div className={`${styles.chartCard} p-3 p-lg-4 mb-3`}>
            <div className={styles.ledgerSum}>
              <span>{t("planner.openingBalance")}</span>
              <div style={{ width: 132, flexShrink: 0 }}>
                <InputGroup size="sm">
                  <InputGroupText>{baseCurrency}</InputGroupText>
                  <Input type="number" inputMode="decimal" placeholder="0" value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} aria-label={t("planner.openingBalance")} />
                </InputGroup>
              </div>
            </div>
            <p className="text-body-secondary mb-2" style={{ fontSize: 11 }}>
              {t("planner.openingBalanceHint")}
            </p>

            <div className={styles.assumption}>
              <span className={styles.assumptionLabel}>{t("planner.moneyIn")}</span>
              <span className={styles.assumptionValue} style={{ color: "var(--color-income)" }}>
                +{formatCurrency(plan.incomeTotal)}
              </span>
            </div>
            <div className={styles.assumption}>
              <span className={styles.assumptionLabel}>{t("planner.moneyOut")}</span>
              <span className={styles.assumptionValue} style={{ color: "var(--color-expense)" }}>
                −{formatCurrency(plan.outgoingTotal)}
              </span>
            </div>
            <div className={styles.ledgerSum}>
              <span>{t("planner.endWith")}</span>
              <span className={styles.assumptionValue} style={{ color: plan.endingBalance < 0 ? "var(--color-expense)" : "var(--color-income)" }}>
                {formatCurrency(plan.endingBalance)}
              </span>
            </div>
          </div>

          {/* ── How it plays out ── */}
          <div className={`${styles.chartCard} p-3 p-lg-4 mb-3`}>
            <div className="d-flex justify-content-between align-items-baseline gap-2 mb-2">
              <span className="fw-semibold" style={{ fontSize: 13.5 }}>
                {t("planner.balanceTitle")}
              </span>
              <span className="text-body-secondary" style={{ fontSize: 11.5 }}>
                {t("planner.perDay", { amount: formatCurrency(plan.safeDailySpend) })}
              </span>
            </div>

            <div className={styles.chartBox}>
              <BalanceLine points={plan.points} breaksOnIndex={breaksOnIndex} selectedIndex={selectedDay} onSelect={setSelectedDay} ariaLabel={t("planner.balanceTitle")} />
            </div>

            <div className="d-flex justify-content-between text-body-secondary mt-1 gap-2" style={{ fontSize: 11 }}>
              <span>{t("planner.today")}</span>
              <span className="text-end">{dateFmt.format(plan.end)}</span>
            </div>

            {/* Tapping any day explains that day rather than leaving the line to
                be read by eye. */}
            {selectedPoint ? (
              <div className={styles.dayDetail}>
                <div className="d-flex justify-content-between align-items-baseline gap-2">
                  <span className="fw-semibold" style={{ fontSize: 12.5 }}>
                    {dateFmt.format(selectedPoint.date)}
                  </span>
                  <span
                    className="fw-semibold"
                    style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", color: selectedPoint.balance < 0 ? "var(--color-expense)" : "var(--color-text-primary)" }}
                  >
                    {formatCurrency(selectedPoint.balance)}
                  </span>
                </div>
                {selectedPoint.events.length === 0 ? (
                  <p className="text-body-secondary mb-0" style={{ fontSize: 11.5 }}>
                    {t("planner.justBudget", { amount: formatCurrency(Math.abs(monthlyLineNet) / getDaysInMonth(selectedPoint.date)) })}
                  </p>
                ) : (
                  selectedPoint.events.map((event, i) => (
                    <div key={i} className="d-flex justify-content-between gap-2" style={{ fontSize: 11.5 }}>
                      <span className="text-truncate">{eventLabel(event)}</span>
                      <span style={{ color: event.amount > 0 ? "var(--color-income)" : "var(--color-expense)", fontVariantNumeric: "tabular-nums" }}>
                        {event.amount > 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(event.amount))}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="text-body-secondary mb-0 mt-2" style={{ fontSize: 11.5 }}>
                {t("planner.tapHint")}
              </p>
            )}
          </div>

          {/* ── What's dated ── */}
          <div className={`${styles.chartCard} p-3 p-lg-4`}>
            <div className="fw-semibold mb-1" style={{ fontSize: 13.5 }}>
              {t("planner.stillComing")}
            </div>
            <p className="text-body-secondary mb-2" style={{ fontSize: 11.5 }}>
              {t("planner.stillComingHint")}
            </p>

            {plan.events.length === 0 ? (
              <p className="text-body-secondary mb-0" style={{ fontSize: 12.5 }}>
                {t("planner.noBillsLeft")}
              </p>
            ) : (
              eventMonths.map((month) => (
                <div key={month.key}>
                  {/* A single-month window is already one month — a heading over
                      it would only repeat the horizon picker. */}
                  {eventMonths.length > 1 && (
                    <div className={styles.monthHeader}>
                      <span>{month.label}</span>
                      <span className={styles.monthTotal}>−{formatCurrency(month.outgoing)}</span>
                    </div>
                  )}
                  {month.events.map(renderEvent)}
                </div>
              ))
            )}
          </div>
        </Col>

        <Col xs={12} lg={5}>
          {/* ── Money in ── */}
          <div className={`${styles.chartCard} p-3 p-lg-4 mb-3`}>
            <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1">
              <span className="fw-semibold" style={{ fontSize: 13.5 }}>
                {t("planner.moneyIn")}
              </span>
              <span className="fw-semibold" style={{ fontSize: 14, color: "var(--color-income)", fontVariantNumeric: "tabular-nums" }}>
                +{formatCurrency(plan.incomeTotal)}
              </span>
            </div>
            <p className="text-body-secondary mb-2" style={{ fontSize: 11.5 }}>
              {t("planner.moneyInHint")}
            </p>

            {/* Salary is the one row the app can only guess at, so it stays
                editable rather than merely switchable. */}
            <div className={styles.salaryRow}>
              <span className={styles.assumptionLabel}>
                {t("planner.salaryLabel")}
                <span className={styles.assumptionHint}>
                  {salaryIsManual ? t("planner.salaryHintSet") : detectedSalary ? t("planner.salaryHintDetected") : t("planner.salaryHintNone")}
                </span>
              </span>
              <div className={styles.salaryFields}>
                <InputGroup size="sm">
                  <InputGroupText>{baseCurrency}</InputGroupText>
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    placeholder={detectedSalary ? String(detectedSalary.amount) : "0"}
                    value={salaryInput.amount}
                    onChange={(e) => setSalaryInput({ ...salaryInput, amount: e.target.value })}
                    aria-label={t("planner.salaryAmount")}
                  />
                </InputGroup>
                <InputGroup size="sm">
                  <InputGroupText>{t("planner.salaryDayPrefix")}</InputGroupText>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    placeholder={detectedSalary ? String(detectedSalary.dayOfMonth) : "1"}
                    value={salaryInput.day}
                    onChange={(e) => setSalaryInput({ ...salaryInput, day: e.target.value })}
                    aria-label={t("planner.salaryDay")}
                  />
                </InputGroup>
              </div>
            </div>
            {salaryIsManual && detectedSalary && (
              <button type="button" className={styles.salaryReset} onClick={() => setSalaryInput({ amount: "", day: "" })}>
                {t("planner.salaryReset", { amount: formatCurrency(detectedSalary.amount), day: detectedSalary.dayOfMonth })}
              </button>
            )}

            {incomeRows.length === 0 ? (
              <p className="text-body-secondary mb-2" style={{ fontSize: 12 }}>
                {t("planner.noSalaryYet")}
              </p>
            ) : (
              incomeRows.map((row) => (row.source === "line" ? renderLineRow(row) : renderRow(row)))
            )}

            {renderDraft("income")}
          </div>

          {/* ── Money out ── */}
          <div className={`${styles.chartCard} p-3 p-lg-4`}>
            <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1">
              <span className="fw-semibold" style={{ fontSize: 13.5 }}>
                {t("planner.moneyOut")}
              </span>
              <span className="fw-semibold" style={{ fontSize: 14, color: "var(--color-expense)", fontVariantNumeric: "tabular-nums" }}>
                −{formatCurrency(plan.outgoingTotal)}
              </span>
            </div>
            <p className="text-body-secondary mb-2" style={{ fontSize: 11.5 }}>
              {t("planner.moneyOutHint")}
            </p>

            {billRows.length > 0 && (
              <>
                {sectionHeader(t("planner.groupBills"), billRows)}
                {billRows.map((row) => renderRow(row))}
              </>
            )}

            {goalRows.length > 0 && (
              <>
                {sectionHeader(t("planner.groupGoals"), goalRows)}
                {goalRows.map((row) => renderRow(row))}
              </>
            )}

            {sectionHeader(t("planner.groupMine"), budgetRows)}
            {budgetRows.length === 0 && draft?.kind !== "expense" && (
              <p className="text-body-secondary mb-1" style={{ fontSize: 12 }}>
                {t("planner.noLinesYet")}
              </p>
            )}
            {budgetRows.map(renderLineRow)}
            {renderDraft("expense")}
          </div>
        </Col>
      </Row>
    </Container>
  );
}
