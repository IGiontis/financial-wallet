import { useMemo, useState } from "react";
import { Alert, Button, Col, Container, Input, InputGroup, InputGroupText, Row, Spinner } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCheckCircle, FiChevronDown, FiChevronRight, FiClock, FiLock } from "react-icons/fi";

import { useTransactions } from "../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../budget/useInvestments";
import { useBills } from "../bills/useBills";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { firestoreToDate } from "../../shared/utils/dates";
import { isDiscretionarySpending, isEarning } from "../../shared/utils/moneyModel";
import { isHardDeadline } from "../bills/billsUtils";
import { buildPlan, detectSalary, goalMonthlyNeed, goalMonthlyTarget, PLANNER_HORIZONS, type PlannerEvent, type PlannerHorizon } from "./plannerUtils";
import { BalanceLine } from "./BalanceLine";
import segmented from "../../shared/css/Segmented.module.css";
import styles from "./css/PlannerPage.module.css";

const VERDICT_STYLE = {
  ok: { className: styles.verdictOk, Icon: FiCheckCircle },
  tight: { className: styles.verdictTight, Icon: FiClock },
  short: { className: styles.verdictShort, Icon: FiAlertTriangle },
} as const;

/**
 * "Will the money last?" — one verdict, the day it breaks, and every assumption
 * behind it laid out so the answer can be argued with rather than trusted.
 *
 * Everything is derived from transactions, bills and goals the app already
 * holds. The only manual input is income the user expects but hasn't received,
 * which nothing can infer.
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

  const [horizon, setHorizon] = useLocalStorage<PlannerHorizon>("planner-horizon", "payday");
  const [extraInput, setExtraInput] = useLocalStorage<string>(`planner-extra-${now.getFullYear()}-${now.getMonth()}`, "");
  const [skippedGoals, setSkippedGoals] = useLocalStorage<string[]>(`planner-skip-${now.getFullYear()}-${now.getMonth()}`, []);
  const [openBreakdown, setOpenBreakdown] = useState<"income" | "spent" | null>(null);
  const [selectedDay, setSelectedDay] = useState(-1);

  const salary = useMemo(() => detectSalary(transactions, now), [transactions, now]);
  const skipIds = useMemo(() => new Set(skippedGoals), [skippedGoals]);

  const plan = useMemo(
    () => buildPlan({ transactions, bills, goals, skipGoalIds: skipIds, expectedExtra: parseFloat(extraInput) || 0, salary, horizon, now }),
    [transactions, bills, goals, skipIds, extraInput, salary, horizon, now],
  );

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }), [lang]);
  // Greek inflects month names: `{ month: "long" }` alone yields the genitive
  // ("Αυγούστου"), which is right inside a date and wrong as a heading. Adding
  // the year switches Intl to the standalone nominative, so the month part is
  // pulled back out of that rather than formatted on its own.
  const monthNameFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }), [lang]);
  const monthName = useMemo(
    () => (date: Date) => monthNameFmt.formatToParts(date).find((part) => part.type === "month")?.value ?? "",
    [monthNameFmt],
  );

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

  // The transactions behind the two headline figures, so neither is a number
  // the user simply has to believe.
  const breakdown = useMemo(() => {
    const inCycle = (d: Date) => d >= plan.cycleStart && d <= now;
    const rows = (match: (tx: (typeof transactions)[number]) => boolean) =>
      transactions
        .filter((tx) => match(tx) && inCycle(firestoreToDate(tx.date)))
        .map((tx) => ({ id: tx.id, label: tx.description, amount: Math.abs(tx.amount), date: firestoreToDate(tx.date) }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());

    return { income: rows(isEarning), spent: rows(isDiscretionarySpending) };
  }, [transactions, plan.cycleStart, now]);

  const paidBills = useMemo(
    () =>
      bills
        .filter((b) => b.isActive && b.isPaidThisPeriod && b.payment && firestoreToDate(b.payment.paidDate) >= plan.cycleStart)
        .map((b) => ({ id: b.id, label: b.name, amount: b.payment!.amount, date: firestoreToDate(b.payment!.paidDate) })),
    [bills, plan.cycleStart],
  );

  // Every goal that costs money in *some* month of the window, not just this
  // one. Filtering on what is still owed this cycle would hide a goal already
  // funded — while the projection kept charging it in later months, with no way
  // for the user to see or switch it off.
  const activeGoals = useMemo(() => goals.filter((g) => g.isActive && !g.isCompleted && goalMonthlyTarget(g, now) > 0), [goals, now]);
  const allGoalsOn = activeGoals.length > 0 && activeGoals.every((g) => !skipIds.has(g.id));

  const breaksOnIndex = plan.breaksOn ? plan.points.findIndex((p) => p.date.getTime() === plan.breaksOn!.getTime()) : -1;
  const selectedPoint = selectedDay >= 0 && selectedDay < plan.points.length ? plan.points[selectedDay] : undefined;

  const toggleGoal = (id: string) => setSkippedGoals((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  const toggleAllGoals = () => setSkippedGoals(allGoalsOn ? activeGoals.map((g) => g.id) : []);

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

  const subline =
    plan.verdict === "short" && plan.breaksOn
      ? plan.breakingEvent
        ? t("planner.breaksOnBill", { date: dateFmt.format(plan.breaksOn), name: plan.breakingEvent.label })
        : t("planner.breaksOn", { date: dateFmt.format(plan.breaksOn) })
      : t("planner.untilDate", { date: dateFmt.format(plan.end), days: plan.daysRemaining });

  const eventLabel = (event: PlannerEvent) =>
    event.kind === "goal" ? t("planner.goalsReserved") : event.kind === "income" ? t("planner.salaryLabel") : event.label;

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

  const renderBreakdown = (which: "income" | "spent") => {
    const rows = which === "income" ? breakdown.income : [...breakdown.spent, ...paidBills].sort((a, b) => b.date.getTime() - a.date.getTime());

    if (rows.length === 0) {
      return (
        <p className="text-body-secondary mb-0 pb-2" style={{ fontSize: 12 }}>
          {t("planner.nothingYet")}
        </p>
      );
    }

    return (
      <div className={styles.breakdown}>
        {rows.map((row) => (
          <div key={row.id} className={styles.breakdownRow}>
            <span className={styles.eventDate}>{dateFmt.format(row.date)}</span>
            <span className={styles.eventName}>{row.label}</span>
            <span className={styles.eventAmount}>{formatCurrency(row.amount)}</span>
          </div>
        ))}
      </div>
    );
  };

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

            <div className="d-flex justify-content-between text-body-secondary mt-1" style={{ fontSize: 11 }}>
              <span>{t("planner.today")}</span>
              <span>{dateFmt.format(plan.end)}</span>
            </div>

            {/* Tapping any day explains that day rather than leaving the line to
                be read by eye. */}
            {selectedPoint ? (
              <div className={styles.dayDetail}>
                <div className="d-flex justify-content-between align-items-baseline gap-2">
                  <span className="fw-semibold" style={{ fontSize: 12.5 }}>
                    {dateFmt.format(selectedPoint.date)}
                  </span>
                  <span className="fw-semibold" style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", color: selectedPoint.balance < 0 ? "var(--color-expense)" : "var(--color-text-primary)" }}>
                    {formatCurrency(selectedPoint.balance)}
                  </span>
                </div>
                {selectedPoint.events.length === 0 ? (
                  <p className="text-body-secondary mb-0" style={{ fontSize: 11.5 }}>
                    {t("planner.justEveryday", { amount: formatCurrency(plan.burnRate) })}
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

          {/* ── What's still coming ── */}
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
          {/* ── The assumptions ── */}
          <div className={`${styles.chartCard} p-3 p-lg-4 mb-3`}>
            <div className="fw-semibold mb-1" style={{ fontSize: 13.5 }}>
              {t("planner.assumptions")}
            </div>
            <p className="text-body-secondary mb-2" style={{ fontSize: 11.5 }}>
              {t("planner.assumptionsHint")}
            </p>

            <button type="button" className={styles.assumptionButton} onClick={() => setOpenBreakdown(openBreakdown === "income" ? null : "income")} aria-expanded={openBreakdown === "income"}>
              <span className={styles.assumptionLabel}>
                {openBreakdown === "income" ? <FiChevronDown size={13} className="me-1" /> : <FiChevronRight size={13} className="me-1" />}
                {t("planner.incomeThisCycle")}
                <span className={styles.assumptionHint}>{salary ? t("planner.salaryDetected", { day: salary.dayOfMonth }) : t("planner.salaryUnknown")}</span>
              </span>
              <span className={styles.assumptionValue} style={{ color: "var(--color-income)" }}>
                {formatCurrency(plan.income)}
              </span>
            </button>
            {openBreakdown === "income" && renderBreakdown("income")}

            <button type="button" className={styles.assumptionButton} onClick={() => setOpenBreakdown(openBreakdown === "spent" ? null : "spent")} aria-expanded={openBreakdown === "spent"}>
              <span className={styles.assumptionLabel}>
                {openBreakdown === "spent" ? <FiChevronDown size={13} className="me-1" /> : <FiChevronRight size={13} className="me-1" />}
                {t("planner.spentSoFar")}
                <span className={styles.assumptionHint}>{t("planner.sinceDate", { date: dateFmt.format(plan.cycleStart) })}</span>
              </span>
              <span className={styles.assumptionValue} style={{ color: "var(--color-expense)" }}>
                −{formatCurrency(plan.spent)}
              </span>
            </button>
            {openBreakdown === "spent" && renderBreakdown("spent")}

            <div className={styles.assumption}>
              <span className={styles.assumptionLabel}>
                {t("planner.burnRate")}
                <span className={styles.assumptionHint}>{t("planner.burnRateHint")}</span>
              </span>
              <span className={styles.assumptionValue}>{t("planner.perDayShort", { amount: formatCurrency(plan.burnRate) })}</span>
            </div>

            <div className={styles.assumption}>
              <span className={styles.assumptionLabel}>
                {t("planner.expectedExtra")}
                <span className={styles.assumptionHint}>{t("planner.expectedExtraHint")}</span>
              </span>
              <div style={{ width: 130, flexShrink: 0 }}>
                <InputGroup size="sm">
                  <InputGroupText>{baseCurrency}</InputGroupText>
                  <Input type="number" min={0} inputMode="decimal" placeholder="0" value={extraInput} onChange={(e) => setExtraInput(e.target.value)} aria-label={t("planner.expectedExtra")} />
                </InputGroup>
              </div>
            </div>
          </div>

          {/* ── Goals, with one switch for the lot ── */}
          <div className={`${styles.chartCard} p-3 p-lg-4`}>
            <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1">
              <span className="fw-semibold" style={{ fontSize: 13.5 }}>
                {t("planner.goalsReserved")}
              </span>
              <span className="fw-semibold" style={{ fontSize: 14, color: "var(--color-goal)", fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(plan.goalsReserved)}
              </span>
            </div>
            <p className="text-body-secondary mb-2" style={{ fontSize: 11.5 }}>
              {t("planner.goalsReservedHint")}
            </p>

            {activeGoals.length === 0 ? (
              <p className="text-body-secondary mb-0" style={{ fontSize: 12.5 }}>
                {t("planner.noGoalsNeedMoney")}
              </p>
            ) : (
              <>
                <Button color="secondary" outline size="sm" className="w-100 mb-1" style={{ fontSize: 12 }} onClick={toggleAllGoals}>
                  {allGoalsOn ? t("planner.skipAll") : t("planner.includeAll")}
                </Button>

                {activeGoals.map((goal) => {
                  const off = skipIds.has(goal.id);
                  return (
                    <div key={goal.id} className={styles.goalRow}>
                      <span className={`${styles.goalName} ${off ? styles.goalOff : ""}`}>
                        {goal.icon} {goal.name}
                      </span>
                      <span className={styles.goalAmount} style={{ color: off ? "var(--color-text-secondary)" : "var(--color-goal)" }}>
                        {off ? t("planner.off") : formatCurrency(goalMonthlyNeed(goal, now))}
                      </span>
                      <Button color="secondary" outline size="sm" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => toggleGoal(goal.id)} aria-pressed={!off}>
                        {off ? t("planner.include") : t("planner.exclude")}
                      </Button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
}
