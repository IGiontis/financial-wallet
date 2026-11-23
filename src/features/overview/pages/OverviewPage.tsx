import { startOfMonth } from "date-fns";
import { monthlyFlows } from "../../analytics/analyticsUtils";
import { lazy, Suspense, useMemo, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { Row, Col, Card, CardBody, Progress } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../../../shared/components/Skeletons";
import { PageWaiting } from "../../../shared/components/PageWaiting";
import { noAnswerYet, usePageLoad } from "../../../shared/hooks/usePageLoad";
import { useTransactions } from "../../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../../budget/useInvestments";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { firestoreToDate, dateFormat } from "../../../shared/utils/dates";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import {
  calculateMetrics,
  calculateMoneyLeft,
  filterTransactions,
  getDateRange,
  groupByMonth,
  groupByWeek,
  sumGoalSavings,
  sumInvestments,
  type CustomRange,
  type TimePeriod,
} from "../overviewUtils";
import OverviewHero from "../components/OverviewHero";
import { LiveClock } from "../components/LiveClock";
import BankStrip from "../components/BankStrip";
import { usePaydayOutlook } from "../usePaydayOutlook";
import { CashFlowLegend } from "../components/CashFlowLegend";
import { CustomRangeModal } from "../components/CustomRangeModal";
import GoalDetailModal from "../components/GoalDetailModal";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "./css/OverviewPage.module.css";
import { useBills } from "../../bills/useBills";
import { useDebts } from "../../debts/useDebts";
import { useIncomes } from "../../incomes/useIncomes";
import { incomeInMonth, salaryIncome } from "../../incomes/incomesUtils";
import { useOpeningBalance } from "../../../shared/hooks/useOpeningBalance";
import { useMoneyAccounts } from "../../accounts/useMoneyAccounts";
import { expectedByAccount, daysSince, goalHeldTotal, projectedTotal, unloggedBetween } from "../../accounts/accountsUtils";
import { usePageTab } from "../../../shared/hooks/usePageTab";
import { PageTabs } from "../../../shared/components/PageTabs";
import { pageTabIds } from "../../../shared/utils/pageTabIds";
import { currentBalance } from "../../../shared/utils/balance";
import { useToday } from "../../../shared/hooks/useToday";
import { netWorthSeries } from "../../analytics/netWorthUtils";
import { monthTimeline } from "../../bills/monthTimeline";
import { monthForecast, overdueBills } from "../../bills/billsUtils";
import BillMonthTimeline from "../../bills/BillMonthTimeline";
import { ROW_PENDING, usePendingRecords } from "../../../shared/hooks/usePendingRecords";
import { attentionItems, goalsProgress, positionParts, spendingByCategory } from "../overviewTabs";
import { useCategories } from "../../transactions/hooks/useTransactions";
import { categoryLabel } from "../../../shared/utils/categories";
import { AttentionList, MonthInOut, Panel, PositionPanel, SpendingPanel, TileGrid, TodayPanel, type OverviewTile } from "../components/OverviewTabs";
import { PageShell } from "../../../shared/components/PageShell";
import { PageHeader } from "../../../shared/components/PageHeader";
import { findCategory } from "../../../shared/utils/categories";
import { debtTotals, debtsByPerson } from "../../debts/debtsUtils";

// recharts is by far the heaviest thing on this page. Loading it separately lets
// the metric cards and goal list paint first instead of waiting on the chart.
const CashFlowChart = lazy(() => import("../components/CashFlowChart"));

/** Same height as the chart, so nothing jumps when it finishes loading. */
function ChartSkeleton() {
  return <Skeleton height={280} style={{ borderRadius: "var(--border-radius-md)" }} />;
}

const PERIODS: { value: TimePeriod; labelKey: string }[] = [
  { value: "current_month", labelKey: "overview.periods.currentMonth" },
  { value: "last_3_months", labelKey: "overview.periods.last3Months" },
  { value: "last_6_months", labelKey: "overview.periods.last6Months" },
  { value: "year_to_date", labelKey: "overview.periods.yearToDate" },
  { value: "this_year", labelKey: "overview.periods.thisYear" },
  { value: "custom", labelKey: "overview.periods.custom" },
];

/**
 * Four ways into the same money, one tab each: what wants doing today, whether
 * the month works, where you stand overall, and a door into every page.
 *
 * Tabs rather than one long page because each answers a different first
 * question, and a newcomer faced with all four at once is exactly the "too much
 * at once" this page was redesigned to stop. The open one is in the address
 * (`?tab=`), and the last one chosen is remembered per device, so whoever
 * prefers "Position" lands on it.
 */
type OverviewTab = "all" | "today" | "month" | "flow" | "position";
const TABS: { id: OverviewTab; labelKey: string }[] = [
  { id: "all", labelKey: "overview.tabAll" },
  { id: "today", labelKey: "overview.tabToday" },
  { id: "month", labelKey: "overview.tabMonth" },
  // The period dashboard the page used to be: any range, its figures and the cash-flow chart.
  { id: "flow", labelKey: "overview.tabFlow" },
  { id: "position", labelKey: "overview.tabPosition" },
];
const TAB_IDS = TABS.map((tab) => tab.id);
const TABS_BASE = "overview";
/** A tab's panel, labelled by its tab (`PageTabs`). */
const panelProps = (tab: OverviewTab) => {
  const ids = pageTabIds(TABS_BASE, tab);
  return { role: "tabpanel", id: ids.panel, "aria-labelledby": ids.tab } as const;
};

export const OverviewPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.resolvedLanguage ?? "en";
  // One clock reading, so nothing memoised on it recomputes each render — the
  // app's shared day (`useToday`): the list of what is due counts the bills on
  // the day the menu's badge does, and moves to a new day with it.
  const now = useToday();
  // In the address (`?tab=`) like every page's tabs; a first visit opens on
  // everything at a glance, after that on the last tab chosen on this device.
  const [tab, setTab] = usePageTab<OverviewTab>(TAB_IDS, "all", "overview-tab");

  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("current_month");
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<InvestmentGoalWithStats | null>(null);
  // Records with a write still on its way: their clickable items here wait for it (`pendingRecords`).
  const { writing } = usePendingRecords();
  const [appliedRange, setAppliedRange] = useState<CustomRange>({
    fromMonth: now.getMonth(),
    fromYear: now.getFullYear(),
    toMonth: now.getMonth(),
    toYear: now.getFullYear(),
  });

  const transactionsQuery = useTransactions();
  const goalsQuery = useInvestmentGoals();
  const { data: transactions = [] } = transactionsQuery;
  const { data: goals = [] } = goalsQuery;
  // The goals' card on «Θέση» waits for the goals on its own, as briefly (`usePageLoad`).
  const goalsLoad = usePageLoad(noAnswerYet(goalsQuery));
  const { format: formatCurrency } = useCurrencyConverter();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  // What is still open each way — the same figures the Debts page heads with.
  const openDebts = useMemo(() => debtTotals(debtsByPerson(debts)), [debts]);
  const { opening, anchors, source: openingSource, missing: openingMissing } = useOpeningBalance();
  // The page waits for the records and for what the balance is counted from —
  // the skeleton for a few seconds at most, then the page (`usePageLoad`).
  // Without the banks' reading the balance would be a different, wrong figure.
  const load = usePageLoad(noAnswerYet(transactionsQuery) || openingMissing);
  const { accounts, readings, latest: lastReading } = useMoneyAccounts();
  // The incomes on «Έσοδα»: the ones late or waiting for the bank question go
  // on the list below, and the salary marks pay day on the month's timeline.
  const { incomes, attention: incomeAttention } = useIncomes(now);

  const balance = useMemo(() => currentBalance(transactions, opening), [transactions, opening]);
  const inGoals = useMemo(() => goalHeldTotal(transactions), [transactions]);
  const banksNow = useMemo(() => (lastReading ? projectedTotal(lastReading, transactions) : undefined), [lastReading, transactions]);
  // Under the money card: each bank as the Banks page has it now, and the
  // month so far as the Statistics count it.
  const accountFigures = useMemo(() => {
    const byAccount = expectedByAccount(accounts, lastReading, transactions);
    return accounts.map((account) => ({ id: account.id, name: account.name, amount: byAccount[account.id] ?? 0 }));
  }, [accounts, lastReading, transactions]);
  const monthSoFar = useMemo(() => {
    const flow = monthlyFlows(transactions, startOfMonth(now), now).at(-1);
    return flow ? { label: t("overview.heroThisMonth"), income: flow.income, expenses: flow.expenses } : undefined;
  }, [transactions, now, t]);

  // ── Will it last until pay day ── the Planner's own walk, from the money above.
  // The reading's time too: pay that came early and only shows in it must not
  // be counted again, and is asked about instead.
  const { outlook, late: lateOccurrences, unconfirmed } = usePaydayOutlook(now, balance, lastReading?.at);


  // ── Today ──
  const attention = useMemo(() => attentionItems(bills, debts, now), [bills, debts, now]);
  const incomeItems = useMemo(() => {
    const names = new Map(incomes.map((income) => [income.id, income.name]));
    return incomeAttention.map((status) => ({ status, name: names.get(status.incomeId) ?? "" }));
  }, [incomes, incomeAttention]);
  const monthTransactions = useMemo(() => filterTransactions(transactions, getDateRange("current_month", appliedRange, now)), [transactions, appliedRange, now]);
  const thisMonth = useMemo(() => calculateMetrics(monthTransactions), [monthTransactions]);
  const investedThisMonth = useMemo(() => sumInvestments(monthTransactions), [monthTransactions]);

  // ── Where it went ── named the way every other screen names a category.
  const { data: categories = [] } = useCategories();
  const spending = useMemo(() => {
    const { total, parts } = spendingByCategory(monthTransactions);
    // Two records whose categories no longer exist both read «Χωρίς κατηγορία»:
    // one line for them, with their amounts added — never the same label twice.
    const merged = new Map<string, number>();
    for (const part of parts) {
      const category = findCategory(categories, part.categoryId);
      const label = part.categoryId ? `${category?.icon ?? ""} ${categoryLabel(category?.name, t) || t("analytics.unknownCategory")}`.trim() : t("overview.everythingElse");
      merged.set(label, Math.round(((merged.get(label) ?? 0) + part.amount) * 100) / 100);
    }
    return { total, parts: [...merged].map(([label, amount]) => ({ label, amount })) };
  }, [monthTransactions, categories, t]);

  // ── The month ──
  const timeline = useMemo(() => {
    const salary = salaryIncome(incomes);
    const pay = salary ? incomeInMonth(salary, transactions, now) : undefined;
    return monthTimeline(bills, now, pay ? { ...pay, label: t("bills.timelineIncome") } : undefined);
  }, [bills, now, incomes, transactions, t]);

  // ── Position ── the same series Analytics draws, over the last six months.
  const position = useMemo(() => netWorthSeries(transactions, debts, anchors, new Date(now.getFullYear(), now.getMonth() - 5, 1), now), [transactions, debts, anchors, now]);

  // ── Banks & cash ── money the readings found gone without a record, this month.
  const monthUnlogged = useMemo(() => unloggedBetween(readings, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)), [readings, now]);
  const readingAge = daysSince(lastReading, now);

  // ── Everything ──
  const late = useMemo(() => overdueBills(bills, now), [bills, now]);
  const lastPosition = position[position.length - 1];
  // What it is made of: the money card's own bank figures, line by line.
  const positionNow = useMemo(() => (lastPosition ? positionParts(lastPosition, banksNow, inGoals) : undefined), [lastPosition, banksNow, inGoals]);

  const minYear = useMemo(() => {
    const fallback = now.getFullYear() - 3;
    if (!transactions.length) return fallback;
    return Math.min(fallback, ...transactions.map((tx) => firestoreToDate(tx.date).getFullYear()));
  }, [transactions, now]);

  const dateRange = useMemo(() => getDateRange(selectedPeriod, appliedRange), [selectedPeriod, appliedRange]);
  const filtered = useMemo(() => filterTransactions(transactions, dateRange), [transactions, dateRange]);

  const isSingleMonth =
    selectedPeriod === "current_month" || (selectedPeriod === "custom" && appliedRange.fromMonth === appliedRange.toMonth && appliedRange.fromYear === appliedRange.toYear);

  const chartData = useMemo(
    () =>
      isSingleMonth
        ? groupByWeek(filtered, dateRange, (n) => `${t("common.week", { defaultValue: "Week" })} ${n}`)
        : groupByMonth(filtered, (d) => dateFormat("monthYearCompact", i18n.resolvedLanguage ?? "en").format(d)),
    [filtered, isSingleMonth, dateRange, t, i18n.resolvedLanguage],
  );


  const metrics = useMemo(() => calculateMetrics(filtered), [filtered]);
  // Net flows — negative when more was withdrawn than deposited, so totals
  // across months show how much is actually tied up.
  const totalInvestments = useMemo(() => sumInvestments(filtered), [filtered]);
  const goalSavings = useMemo(() => sumGoalSavings(filtered), [filtered]);
  const moneyLeft = useMemo(() => calculateMoneyLeft(filtered), [filtered]);

  const activeGoals = useMemo(
    () =>
      goals
        .filter((g) => !g.isCompleted && g.isActive)
        .sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return firestoreToDate(a.deadline).getTime() - firestoreToDate(b.deadline).getTime();
        })
        .slice(0, 6),
    [goals],
  );

  // Keep an open detail modal in sync if the goal's stats change underneath it
  // (e.g. a deposit logged from another tab) instead of freezing a stale snapshot.
  const liveSelectedGoal = selectedGoal ? (goals.find((g) => g.id === selectedGoal.id) ?? null) : null;

  const customLabel = useMemo(() => {
    if (selectedPeriod !== "custom") return t("overview.periods.custom");
    const fmt = dateFormat("monthYearShort", i18n.resolvedLanguage ?? "en");
    const from = fmt.format(new Date(appliedRange.fromYear, appliedRange.fromMonth, 1));
    const to = fmt.format(new Date(appliedRange.toYear, appliedRange.toMonth, 1));
    return from === to ? from : `${from} – ${to}`;
  }, [selectedPeriod, appliedRange, i18n.resolvedLanguage, t]);

  const handlePeriodChange = (period: TimePeriod) => {
    if (period === "custom") {
      setModalOpen(true);
      return;
    }
    startTransition(() => setSelectedPeriod(period));
  };

  const goalsGlance = (
        <Card className="mb-0">
            <CardBody className="p-3 p-sm-4">
              <p className="fw-medium mb-1" style={{ fontSize: "var(--fs-lead)" }}>
                {t("overview.activeGoals")}
              </p>
              <p className="small text-body-secondary mb-3">{t("overview.goalsAtAGlance")}</p>

              {goalsLoad === "loading" ? (
                <SkeletonRows count={3} icon={false} />
              ) : goalsLoad === "waiting" ? (
                <PageWaiting className="py-4" />
              ) : activeGoals.length === 0 ? (
                <div className="d-flex flex-column align-items-center justify-content-center text-center text-body-secondary" style={{ height: 200, fontSize: "var(--fs-text)" }}>
                  <span>{t("overview.noGoalsYet")}</span>
                  <span>{t("overview.createOneIn")}</span>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                  {activeGoals.map((goal) => {
                    const isTargeted = goal.goalType === "targeted";
                    const pct = Math.min(goal.percentageReached ?? 0, 100);
                    const progressColor = goal.status === "behind" ? "danger" : goal.status === "ahead" ? "info" : "primary";
                    return (
                      <div
                        key={goal.id}
                        // A goal with any write on its way (a deposit not yet acknowledged, a delete) opens nothing until it lands.
                        className={`p-3 ${styles.goalCard} ${writing("investmentGoals", goal.id) ? ROW_PENDING : ""}`}
                        role="button"
                        tabIndex={writing("investmentGoals", goal.id) ? -1 : 0}
                        aria-disabled={writing("investmentGoals", goal.id) || undefined}
                        onClick={() => !writing("investmentGoals", goal.id) && setSelectedGoal(goal)}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !writing("investmentGoals", goal.id)) {
                            e.preventDefault();
                            setSelectedGoal(goal);
                          }
                        }}
                        style={{
                          background: "var(--color-background-secondary)",
                          borderRadius: "var(--border-radius-md)",
                          borderLeft: `3px solid ${goal.color ?? "var(--bs-primary)"}`,
                          minWidth: 0,
                        }}
                      >
                        <div className="d-flex align-items-center gap-2 mb-2" style={{ minWidth: 0 }}>
                          <span className="flex-shrink-0" style={{ fontSize: 16 }}>
                            {goal.icon ?? "💰"}
                          </span>
                          <p className="fw-medium text-truncate text-body-emphasis mb-0" style={{ fontSize: "var(--fs-text)", minWidth: 0 }}>
                            {goal.name}
                          </p>
                        </div>

                        {isTargeted && goal.targetAmount ? (
                          <>
                            <Progress value={pct} color={progressColor} style={{ height: 4, borderRadius: 2, marginBottom: 5 }} />
                            <div className="d-flex justify-content-between text-body-secondary" style={{ fontSize: "var(--fs-caption)" }}>
                              <span>{formatCurrency(goal.totalSaved)}</span>
                              <span className="fw-medium">{pct.toFixed(0)}%</span>
                            </div>
                          </>
                        ) : (
                          <p className="fw-medium text-body-emphasis mb-0" style={{ fontSize: "var(--fs-lead)" }}>
                            {formatCurrency(goal.totalSaved)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
        </Card>
  );

  const goalProgress = goalsProgress(goals);
  // What this month's bills have already had paid — the same figure as «πληρωμένα» on the Bills page.
  const billsPaid = monthForecast(bills, now, 0).prepaid;
  const billsRows = billsPaid > 0.005 ? [{ label: t("overview.tileBillsPaid"), value: formatCurrency(billsPaid), tone: "var(--color-income-text)" }] : undefined;

  const tiles: OverviewTile[] = [
    late.bills.length > 0
      ? { to: "/bills/pay", label: t("nav.bills"), value: t("overview.tileLate", { count: late.bills.length }), sub: formatCurrency(late.total), tone: "var(--color-expense-text)", rows: billsRows }
      : { to: "/bills", label: t("nav.bills"), value: t("overview.allClearShort"), sub: t("overview.tileNothingLate"), tone: "var(--color-income-text)", rows: billsRows },
    { to: "/transactions", label: t("nav.transactions"), value: formatCurrency(thisMonth.totalExpenses), sub: t("overview.soFarThisMonth") },
    // Only with a debt still open: an empty "0,00 € you owe" was a tile about nothing.
    // Both sides and what they come to — the net is what you would be left
    // with if everything were settled today.
    ...(openDebts.owedByMe > 0 || openDebts.owedToMe > 0
      ? [
          {
            to: "/debts",
            label: t("nav.debts"),
            value: `${openDebts.net > 0 ? "+" : openDebts.net < 0 ? "−" : ""}${formatCurrency(Math.abs(openDebts.net))}`,
            sub: t(openDebts.net >= 0 ? "overview.tileDebtNetIn" : "overview.tileDebtNetOut"),
            tone: openDebts.net > 0 ? "var(--color-income-text)" : openDebts.net < 0 ? "var(--color-expense-text)" : undefined,
            rows: [
              { label: t("overview.tileDebtOwe"), value: formatCurrency(openDebts.owedByMe), tone: openDebts.owedByMe > 0 ? "var(--color-expense-text)" : undefined },
              { label: t("overview.tileDebtLent"), value: formatCurrency(openDebts.owedToMe), tone: openDebts.owedToMe > 0 ? "var(--color-income-text)" : undefined },
            ],
          },
        ]
      : []),
    goalProgress.target > 0
      ? { to: "/goals", label: t("nav.goals"), value: `${goalProgress.percent}%`, sub: t("overview.tileGoalsOf", { saved: formatCurrency(goalProgress.saved), target: formatCurrency(goalProgress.target) }), tone: "var(--color-goal)" }
      : { to: "/goals", label: t("nav.goals"), value: formatCurrency(lastPosition?.saved ?? 0), sub: t("overview.tileSaved"), tone: "var(--color-invest)" },
    { to: "/analytics", label: t("nav.analytics"), value: formatCurrency(lastPosition?.net ?? balance), sub: t("overview.netPosition") },
    { to: "/incomes", label: t("nav.incomes"), value: formatCurrency(thisMonth.totalIncome), sub: t("overview.tileCameIn") },
    { to: "/investments", label: t("nav.investments"), value: `${investedThisMonth >= 0 ? "+" : "−"}${formatCurrency(Math.abs(investedThisMonth))}`, sub: t("overview.tileInvestedMonth"), tone: "var(--color-invest)" },
  ];

  const attentionList = (
    <AttentionList
      items={attention}
      incomes={incomeItems}
      late={lateOccurrences}
      unconfirmed={unconfirmed}
      now={now}
      formatCurrency={formatCurrency}
    />
  );

  // A failed read is tried again on its own (`installQueryAutoRetry`): no
  // message, nothing for the user to do. It used to keep the skeleton for as
  // long as it failed — for ever, on a read that never got through.
  if (load === "waiting") {
    return (
      <PageShell>
        <PageHeader title={t("overview.title")} subtitle={dateFormat("dayMonthWeekday", locale).format(now)} />
        <PageWaiting />
      </PageShell>
    );
  }
  if (load === "loading") {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <SkeletonStats />
        <Row className="g-3">
          <Col xs={12} lg={8}>
            <SkeletonChartCard height={260} />
          </Col>
          <Col xs={12} lg={4}>
            <SkeletonCard>
              <SkeletonHeading />
              <SkeletonRows count={4} />
            </SkeletonCard>
          </Col>
        </Row>
      </PageShell>
    );
  }


  return (
    <PageShell>
      <CustomRangeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onApply={(range) => {
          setAppliedRange(range);
          startTransition(() => setSelectedPeriod("custom"));
        }}
        initialRange={appliedRange}
        minYear={minYear}
      />

      {liveSelectedGoal && <GoalDetailModal goal={liveSelectedGoal} formatCurrency={formatCurrency} onClose={() => setSelectedGoal(null)} />}

      {/* The shared header card: the page's name and the day — a date is what a
          home screen is opened to learn, a sentence about what the app does is
          not — and, inside the same card, which view is the first thing chosen.
          Labelled and full width, so on a phone each tab is a real target. */}
      <PageHeader
        title={t("overview.title")}
        subtitle={
          <>
            {dateFormat("dayMonthWeekday", locale).format(now)}
            {" · "}
            {/* Ticks on its own: the page is not re-rendered each second. */}
            <LiveClock locale={locale} />
          </>
        }
      >
        <PageTabs
          base={TABS_BASE}
          label={t("overview.title")}
          tabs={TABS.map(({ id, labelKey }) => ({ id, label: t(labelKey) }))}
          value={tab}
          onChange={setTab}
          data-tour="overview-tabs"
        />
      </PageHeader>

      {/* Each tab its own: nothing is shown on two of them. "All" is the
          answer and the way out to every page; "Today" what needs doing and
          what moved today; "The month" its in and out, where it went and its
          bills in order; "Position" what you are worth and your goals. */}
      {tab === "all" && (
        <div className={styles.allStack} {...panelProps("all")}>
          <div>
            <OverviewHero
              bankStrip={<BankStrip inCard hasAccounts={accounts.length > 0} latest={lastReading} age={readingAge} formatCurrency={formatCurrency} />}
              balance={balance}
              source={openingSource}
              isLoading={openingMissing}
              banks={banksNow}
              inGoals={inGoals}
              accounts={accountFigures}
              month={monthSoFar}
              outlook={outlook}
              now={now}
              formatCurrency={formatCurrency}
              locale={locale}
            />
          </div>
          <TileGrid tiles={tiles} />
        </div>
      )}

      {tab === "today" && (
        <div className={styles.stack} {...panelProps("today")}>
          {attentionList}
          <TodayPanel transactions={transactions} categories={categories} now={now} formatCurrency={formatCurrency} />
        </div>
      )}

      {tab === "month" && (
        <div className={styles.stack} {...panelProps("month")}>
          <MonthInOut
            income={thisMonth.totalIncome}
            expenses={thisMonth.totalExpenses}
            unlogged={monthUnlogged}
            formatCurrency={formatCurrency}
            sub={outlook.known ? t("overview.paydayOn", { date: dateFormat("dayShort", locale).format(outlook.date) }) : undefined}
          />
          <SpendingPanel parts={spending.parts} total={spending.total} formatCurrency={formatCurrency} />

          {/* The month in order, last: the figures above answer "how is it
              going", this is the detail for whoever wants the dates. */}
          {bills.length > 0 && (
            <Panel>
              <BillMonthTimeline timeline={timeline} now={now} formatCurrency={formatCurrency} locale={locale} onOpenBill={() => navigate("/bills/pay")} />
            </Panel>
          )}
        </div>
      )}

      {tab === "position" && (
        <div className={styles.stack} {...panelProps("position")}>
          <PositionPanel series={position} parts={positionNow} formatCurrency={formatCurrency} locale={locale} />
          {goalsGlance}
        </div>
      )}

      {tab === "flow" && (
      <div {...panelProps("flow")}>
      <div className="d-flex justify-content-end mb-3">
        <div className={`${segmented.group} ${styles.periodPicker}`}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePeriodChange(p.value)}
              disabled={isPending}
              className={`${segmented.item} ${selectedPeriod === p.value ? segmented.active : ""}`}
            >
              {p.value === "custom" ? customLabel : t(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* ── The month, as unequal tiles ──
          Six identical cards gave the balance, the month's income and the money
          left over the same weight, so the page stressed nothing. The figure
          that answers "am I all right" now takes four times the area of the
          ones that qualify it, and the rest fall in behind it. */}
      <div className={styles.bento} style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>

        <Card className="mb-0">
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.totalIncome")}</span>
            <span className={styles.statValue} style={{ color: "var(--color-income-text)" }}>
              {formatCurrency(metrics.totalIncome)}
            </span>
          </CardBody>
        </Card>

        <Card className="mb-0">
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.totalExpenses")}</span>
            <span className={styles.statValue} style={{ color: "var(--color-expense-text)" }}>
              {formatCurrency(metrics.totalExpenses)}
            </span>
          </CardBody>
        </Card>

        <Card className={`${styles.wide} mb-0`}>
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.netIncome")}</span>
            <span className={styles.statValue} style={{ color: metrics.netIncome >= 0 ? "var(--color-income-text)" : "var(--color-expense-text)" }}>
              {formatCurrency(metrics.netIncome)}
            </span>
            {/* The same two figures again as one rule: "net" is a subtraction,
                and a subtraction is easier to believe when you can see it. */}
            {metrics.totalIncome + metrics.totalExpenses > 0 && (
              <span className={styles.split} aria-hidden>
                <span style={{ width: `${(metrics.totalExpenses / (metrics.totalIncome + metrics.totalExpenses)) * 100}%`, background: "var(--color-expense)" }} />
                <span style={{ width: `${(metrics.totalIncome / (metrics.totalIncome + metrics.totalExpenses)) * 100}%`, background: "var(--color-income)" }} />
              </span>
            )}
          </CardBody>
        </Card>

        <Card className="mb-0">
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.invested")}</span>
            <span className={styles.statValue} style={{ color: "var(--color-invest)" }}>
              {formatCurrency(totalInvestments)}
            </span>
          </CardBody>
        </Card>

        <Card className="mb-0">
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.goalSavings")}</span>
            <span className={styles.statValue} style={{ color: "var(--color-goal)" }}>
              {formatCurrency(goalSavings)}
            </span>
          </CardBody>
        </Card>

        <Card className={`${styles.wide} mb-0`}>
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.moneyLeft")}</span>
            <span className={styles.statValue} style={{ color: moneyLeft >= 0 ? "var(--color-income-text)" : "var(--color-expense-text)" }}>
              {formatCurrency(moneyLeft)}
            </span>
          </CardBody>
        </Card>

        <Card className={`${styles.full} mb-0`}>
            <CardBody className="p-3 p-sm-4">
              <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <div>
                  <p className="fw-medium mb-0" style={{ fontSize: "var(--fs-lead)" }}>
                    {t("overview.cashFlow")}
                  </p>
                  <p className="small text-body-secondary mb-0">{isSingleMonth ? t("overview.weeklyBreakdown") : t("overview.monthlyBreakdown")}</p>
                </div>
                <CashFlowLegend />
              </div>

              {chartData.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center text-body-secondary" style={{ height: 280, fontSize: "var(--fs-lead)" }}>
                  {t("overview.noTransactionsPeriod")}
                </div>
              ) : (
                <Suspense fallback={<ChartSkeleton />}>
                  {/* Compact axis on phones, full currency labels from sm up */}
                  <div className="d-sm-none">
                    <CashFlowChart data={chartData} formatCurrency={formatCurrency} compact />
                  </div>
                  <div className="d-none d-sm-block">
                    <CashFlowChart data={chartData} formatCurrency={formatCurrency} />
                  </div>
                </Suspense>
              )}
            </CardBody>
          </Card>

      </div>
      </div>
      )}

    </PageShell>
  );
};
