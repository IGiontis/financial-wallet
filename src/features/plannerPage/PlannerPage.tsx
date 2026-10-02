import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Col, Row } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonPageHeader, SkeletonRows } from "../../shared/components/Skeletons";
import { FiChevronRight, FiPlus } from "react-icons/fi";

import { useTransactions } from "../transactions/hooks/useTransactions";
import { useOpeningBalance } from "../../shared/hooks/useOpeningBalance";
import { useMoneyAccounts } from "../accounts/useMoneyAccounts";
import { goalHeldTotal, projectedTotal } from "../accounts/accountsUtils";
import { currentBalance } from "../../shared/utils/balance";
import { useInvestmentGoals } from "../budget/useInvestments";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { plannableDebts } from "../debts/debtsUtils";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { useSalary } from "../../shared/hooks/useSalary";
import { useDebounce } from "../../shared/hooks/useDebounce";
import { PAYDAY_HORIZON, paydayOutlook } from "../overview/overviewTabs";
import {
  asHorizon,
  buildPlan,
  monthStart,
  nextOneOffDate,
  oneOffDate,
  repeatLabel,
  repeatMonths,
  type BudgetLine,
  type OneOff,
  type PlannerHorizon,
  type PlanRow,
  SALARY_ROW_ID,
} from "./plannerUtils";
import { payCycles, planMonths, sliceSteps } from "./payCycles";
import PlannerPaydayCard, { type PaydaySteps } from "./components/PlannerPaydayCard";
import PeriodCard from "./components/PeriodCard";
import AnswerStrip from "./components/AnswerStrip";
import PlannerTimeline from "./components/PlannerTimeline";
import OccurrenceSheet from "./components/OccurrenceSheet";
import SalaryEditor from "./components/SalaryEditor";
import type { OccurrenceOverride, ResolvedOccurrence } from "./plannerActuals";
import { answerUnconfirmed, cleanLines, cleanOneOffs, cleanOverrides, cleanSkipped, PLANNER_KEYS, withOverride } from "./plannerInputs";
import LeverGroup from "./components/LeverGroup";
import EntryEditor, { type EntryDraft } from "./components/EntryEditor";
import segmented from "../../shared/css/Segmented.module.css";
import styles from "./css/PlannerPage.module.css";
import { PageShell } from "../../shared/components/PageShell";

const newId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Which groups start unrolled. Income holds the salary, which is the one thing most visits come to change. */
const DEFAULT_OPEN: Record<string, boolean> = { income: true };

/**
 * A forward budget: what arrives, what leaves, over the next one to twelve
 * months — and whether the first covers the second.
 *
 * Nothing here is inferred from what has already been spent. Bills and goals
 * come from the app because they are commitments already made; everything else
 * is the user's own estimate of the months ahead, and every row can be switched
 * off to ask "and if I dropped this?".
 *
 * The page is arranged around two questions, each with a card that names its
 * answer. First the Overview's own: do you make it to pay day — the same card,
 * the same figure, worked out from the same plan. Then the whole period: what
 * you end with, whether the balance ever goes under on the way, and the chart
 * of what each pay leaves behind. Under those, month by month and the levers —
 * folded, so a phone is not handed forty rows before it is handed the answers,
 * and with a strip that keeps both answers in sight while you change them.
 */
export function PlannerPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const { data: transactions = [], isLoading: txLoading, isError } = useTransactions();
  // The plan starts from the money you have — the Overview's figure, counted
  // the same way: from the banks once they have been read, otherwise from the
  // records. It used to start from a typed figure until the banks were read,
  // so before then the two pages answered "until pay day" from two different
  // amounts. A figure of one's own is still there, as a "what if".
  const { opening: balanceFrom, source: balanceSource, isLoading: openingLoading } = useOpeningBalance();
  const available = useMemo(() => currentBalance(transactions, balanceFrom), [transactions, balanceFrom]);
  // When the banks were last read: pay that came early and is only in that
  // reading must not be planned a second time — see `mayBeInReading`.
  const { latest: lastReading } = useMoneyAccounts();
  const lastReadingAt = lastReading?.at;
  // For the line under the figure: "Banks 1.200 − 200 in goals", as on the Overview.
  const inGoals = useMemo(() => goalHeldTotal(transactions), [transactions]);
  const banksNow = useMemo(() => (lastReading ? projectedTotal(lastReading, transactions) : undefined), [lastReading, transactions]);
  const { data: goals = [], isLoading: goalLoading } = useInvestmentGoals();
  const { data: bills = [], isLoading: billLoading } = useBills();
  const { data: allDebts = [] } = useDebts();
  const { format: formatCurrency, baseCurrency } = useCurrencyConverter();

  // One clock reading for the visit, so the projection doesn't shift mid-render.
  const [now] = useState(() => new Date());

  // Everything below is read back from localStorage, where a value written by an
  // older version of this page can still be sitting. None of these are trusted
  // on their type alone — one stale horizon name was enough to take the whole
  // page down with an invalid date.
  const [storedHorizon, setHorizon] = useWorkspaceSetting<PlannerHorizon>(PLANNER_KEYS.horizon, 1);
  const [openingInput, setOpeningInput] = useWorkspaceSetting(PLANNER_KEYS.opening, "");
  const [storedLines, setLines] = useWorkspaceSetting<BudgetLine[]>(PLANNER_KEYS.lines, []);
  const [storedOneOffs, setOneOffs] = useWorkspaceSetting<OneOff[]>(PLANNER_KEYS.oneOffs, []);
  const [storedSkipped, setSkipped] = useWorkspaceSetting<string[]>(PLANNER_KEYS.skip, []);
  const [openingSource, setOpeningSource] = useWorkspaceSetting<"banks" | "manual">(PLANNER_KEYS.openingSource, "banks");
  // What the user said about single occurrences — "the rent is coming on the
  // 1st", "no bonus this year". Keyed by item and expected day; see plannerActuals.
  const [storedOverrides, setOverrides] = useWorkspaceSetting<Record<string, OccurrenceOverride>>(PLANNER_KEYS.occurrences, {});
  const [openOccurrence, setOpenOccurrence] = useState<string | null>(null);
  const [editingSalary, setEditingSalary] = useState(false);
  // Which groups are folded is a habit of this screen on this device, not part
  // of the plan — it stays local while everything above it syncs.
  const [storedOpen, setOpen] = useLocalStorage<Record<string, boolean>>("planner-open-groups", DEFAULT_OPEN);
  // Which half of the planner a phone is looking at. On a laptop both are on
  // screen at once and this is ignored — see the two `d-lg-block` below.
  const [pane, setPane] = useLocalStorage<"numbers" | "months">("planner-pane", "months");

  const horizon = asHorizon(storedHorizon);
  // Memoised because it feeds the plan: a fresh object each render would
  // rebuild the whole projection on every keystroke anywhere on the page. The
  // checks themselves are shared with the Overview — see `plannerInputs`.
  const lines = useMemo(() => cleanLines(storedLines), [storedLines]);
  const oneOffs = useMemo(() => cleanOneOffs(storedOneOffs), [storedOneOffs]);
  const skipped = useMemo(() => cleanSkipped(storedSkipped), [storedSkipped]);
  const open = useMemo(() => (storedOpen && typeof storedOpen === "object" ? storedOpen : DEFAULT_OPEN), [storedOpen]);

  // One dialog for every figure the user owns, rather than an inline editor
  // permanently unrolled under each row.
  const [editor, setEditor] = useState<{ mode: "line" | "oneoff"; kind?: "income" | "expense"; draft: EntryDraft } | null>(null);

  const skipIds = useMemo(() => new Set(skipped), [skipped]);

  // Shared with the bills timeline, so the two screens cannot end up planning
  // against different pay days.
  const { salary, input: salaryInput, setInput: setSalaryInput, detected: detectedSalary, isManual: salaryIsManual } = useSalary(now);

  // Only what is owed: money owed *to* you is not income until it turns up, and
  // a plan that spent it in advance would be promising an unmade sale.
  const debts = useMemo(() => plannableDebts(allDebts), [allDebts]);

  // The two things that are *typed* are held back a moment before the
  // projection is rebuilt. Every other input — a switch, a horizon pill — is a
  // single discrete change, but a text box fires per character, and rebuilding
  // three years of plan on each one cost about 150ms a keystroke. The fields
  // themselves stay immediate; only the answer waits for you to finish.
  const plannedOpening = useDebounce(openingInput, 250);
  const plannedSalary = useDebounce(salary, 250);

  const overrides = useMemo(() => cleanOverrides(storedOverrides), [storedOverrides]);
  // The records the plan checks each salary, instalment and one-off against, so
  // one that came early is not counted again and one that is late is not lost.
  const actuals = useMemo(() => ({ transactions, debts, overrides, lastReadingAt }), [transactions, debts, overrides, lastReadingAt]);
  const fromBanks = openingSource !== "manual";
  const openingBalance = fromBanks ? available : parseFloat(plannedOpening) || 0;

  // Everything the plan is built from except where it starts and how far it looks.
  const inputs = useMemo(
    () => ({ bills, goals, lines, oneOffs, debts, salary: plannedSalary, skipIds, now, actuals }),
    [bills, goals, lines, oneOffs, debts, plannedSalary, skipIds, now, actuals],
  );
  const plan = useMemo(() => buildPlan({ ...inputs, openingBalance, horizon }), [inputs, openingBalance, horizon]);
  // "Until pay day" is read off a plan exactly like the Overview's: the same
  // inputs, the same two months. Not off the one above, whose points thin out
  // to a week apart from four months on — and a weekly line has no point on
  // the eve of pay day, so a year's view would have answered from the wrong
  // evening. A day's balance does not depend on how far ahead a plan looks,
  // so the two agree on every day they share.
  const cardPlan = useMemo(() => buildPlan({ ...inputs, openingBalance, horizon: PAYDAY_HORIZON }), [inputs, openingBalance]);
  const outlook = useMemo(() => paydayOutlook(cardPlan, now), [cardPlan, now]);
  // With a figure of your own, what the Overview says from the money you have.
  const realLeft = useMemo(
    () => (fromBanks ? undefined : paydayOutlook(buildPlan({ ...inputs, openingBalance: available, horizon: PAYDAY_HORIZON }), now).left),
    [fromBanks, inputs, available, now],
  );
  const cycles = useMemo(() => payCycles(plan), [plan]);
  const months = useMemo(() => planMonths(plan), [plan]);

  // The list behind the card's figure: the first stretch of the card's plan,
  // which ends on the eve of pay day — or, with the pay held on today, nothing
  // comes between, and the list is the money now and the pay.
  const cardSteps = useMemo((): PaydaySteps => {
    const [first, second] = payCycles(cardPlan);
    if (first.pay > 0) return { steps: [{ kind: "carried", amount: outlook.start, date: first.start }], days: 1, close: { date: first.start, amount: outlook.left }, nextPay: first.payEvents[0] };
    return { steps: sliceSteps(first), days: first.days, close: { date: first.end, amount: first.close }, nextPay: second?.kind === "pay" ? second.payEvents[0] : undefined };
  }, [cardPlan, outlook]);

  const settled = useMemo(() => plan.occurrences.filter((o) => o.status === "received" || o.status === "skipped"), [plan.occurrences]);
  // Left out of the plan until answered, so asked where the plan is read —
  // from the card's plan, which is the one the question changes.
  const unconfirmed = useMemo(() => cardPlan.occurrences.filter((o) => o.status === "unconfirmed"), [cardPlan.occurrences]);
  // The card's list can open a pay just past the horizon's end, so both plans are asked.
  const occurrence = openOccurrence ? (plan.occurrences.find((o) => o.key === openOccurrence) ?? cardPlan.occurrences.find((o) => o.key === openOccurrence)) : undefined;
  const saveOverride = (key: string, value: OccurrenceOverride | undefined) => {
    setOverrides((previous) => withOverride(previous, key, value, now));
    setOpenOccurrence(null);
  };
  const answer = (o: ResolvedOccurrence, arrived: boolean) => saveOverride(o.key, answerUnconfirmed(o, arrived, now));

  // The strip over the page while the first card is out of sight. Watched by
  // the card's own element, which only exists once the data has loaded — hence
  // a ref that is state, so the watch starts when the card does.
  const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null);
  const [cardOutOfSight, setCardOutOfSight] = useState(false);
  useEffect(() => {
    if (!cardElement || typeof IntersectionObserver === "undefined") return;
    // Only once it has gone off the top: below the fold, on a short screen, it has not been read yet.
    const observer = new IntersectionObserver(([entry]) => setCardOutOfSight(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(cardElement);
    return () => observer.disconnect();
  }, [cardElement]);
  const backToCard = useCallback(() => cardElement?.scrollIntoView({ behavior: "smooth", block: "start" }), [cardElement]);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }), [lang]);

  // Two decimals would read as noise; one says "not quite a whole month". The
  // plural is chosen from the same rounded figure that is printed, so 1.03
  // months reads "1 month" rather than "1 months".
  const monthsShown = Math.round(plan.monthsCovered * 10) / 10;
  const monthsLabel = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(monthsShown);

  // Which section a budget line belongs to is its kind, not the sign of its
  // figure. Reading the sign meant a line sitting at zero matched neither
  // list — so clearing the box to type a new number made the whole row
  // disappear mid-keystroke, exactly as if it had been deleted.
  const rowsOf = (match: (row: PlanRow) => boolean) => plan.rows.filter(match);
  const incomeRows = rowsOf((r) => r.source === "salary" || (r.source === "line" && r.kind === "income"));
  const billRows = rowsOf((r) => r.source === "bill");
  const goalRows = rowsOf((r) => r.source === "goal");
  const budgetRows = rowsOf((r) => r.source === "line" && r.kind === "expense");
  const debtRows = rowsOf((r) => r.source === "debt");
  const oneOffRows = rowsOf((r) => r.source === "oneoff");
  // Soonest first, so the next thing to happen is the first thing read.
  const startOfToday = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  // Ordered by the day each one next lands on rather than by the day it was
  // first entered: a coupon that started paying two years ago belongs beside
  // the other pay still to come, not above everything as the oldest date.
  const oneOffsByDate = useMemo(
    () => [...oneOffs].sort((a, b) => ((nextOneOffDate(a, startOfToday) ?? oneOffDate(a.date))?.getTime() ?? 0) - ((nextOneOffDate(b, startOfToday) ?? oneOffDate(b.date))?.getTime() ?? 0)),
    [oneOffs, startOfToday],
  );
  const seasonFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short" }), [lang]);
  // The month a repeat stops in carries its year: "every year until Apr" says
  // nothing on its own.
  const seasonYearFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short", year: "numeric" }), [lang]);

  // A one-off can sit in another year, so the short "20 Sep" is not enough.
  const longDateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }), [lang]);

  const sumOf = (rows: PlanRow[]) => rows.reduce((sum, r) => sum + r.total, 0);

  // Written from the sanitised copies rather than through a functional update,
  // so a malformed stored value is replaced by a clean one instead of being
  // spread back into the next write.
  const toggleRow = (id: string) => setSkipped(skipped.includes(id) ? skipped.filter((s) => s !== id) : [...skipped, id]);
  const setAll = (rows: PlanRow[], on: boolean) => {
    const ids = rows.map((r) => r.id);
    setSkipped(on ? skipped.filter((s) => !ids.includes(s)) : Array.from(new Set([...skipped, ...ids])));
  };
  const toggleGroup = (key: string) => setOpen({ ...open, [key]: !open[key] });

  type Editor = { mode: "line" | "oneoff"; kind?: "income" | "expense"; draft: EntryDraft };

  /** Opens the editor for a row the user owns; undefined for rows the app keeps. */
  const editHandler = (row: PlanRow) => {
    if (row.source !== "line") return undefined;
    const line = lines.find((l) => l.id === row.id);
    return line
      ? () =>
          setEditor({
            mode: "line",
            kind: line.kind,
            draft: { id: line.id, label: line.label, amount: String(line.amount), from: line.from, to: line.to, yearly: line.yearly, until: line.until },
          })
      : undefined;
  };

  const saveEntry = (editor: Editor, draft: EntryDraft) => {
    const amount = parseFloat(draft.amount);

    if (editor.mode === "oneoff") {
      const label = draft.label || t("planner.oneOffFallbackName");
      // Undefined rather than 0 or "" for an entry that happens once, so what
      // is stored says "no repeat" instead of "a repeat of nothing".
      const entry: OneOff = {
        id: draft.id ?? newId(),
        label,
        amount,
        date: draft.date ?? "",
        ...(draft.every ? { every: draft.every } : {}),
        ...(draft.every && draft.until ? { until: draft.until } : {}),
      };
      setOneOffs(draft.id ? oneOffs.map((o) => (o.id === draft.id ? entry : o)) : [...oneOffs, entry]);
    } else {
      const label = draft.label || t("planner.lineFallbackName");
      // Undefined rather than "" for an unset end, so a line with no season
      // stores nothing at all and reads back as "runs the whole time".
      const entry: BudgetLine = {
        id: draft.id ?? newId(),
        label,
        amount,
        kind: editor.kind ?? "expense",
        ...(draft.from ? { from: draft.from } : {}),
        ...(draft.to ? { to: draft.to } : {}),
        // A repeat needs a month to repeat from, and an end with nothing
        // repeating is a figure that applies to nothing.
        ...(draft.from && draft.yearly ? { yearly: true } : {}),
        ...(draft.from && draft.yearly && draft.until ? { until: draft.until } : {}),
      };
      setLines(draft.id ? lines.map((l) => (l.id === draft.id ? entry : l)) : [...lines, entry]);
    }
    setEditor(null);
  };

  const deleteEntry = (editor: Editor) => {
    const id = editor.draft.id;
    if (!id) return;
    if (editor.mode === "oneoff") setOneOffs(oneOffs.filter((o) => o.id !== id));
    else setLines(lines.filter((l) => l.id !== id));
    setEditor(null);
  };

  if (txLoading || goalLoading || billLoading || openingLoading) {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <Row className="g-3">
          <Col xs={12} lg={7}>
            <SkeletonCard className="mb-3">
              <Skeleton height={14} width="35%" />
              <Skeleton height={36} width="55%" style={{ marginTop: 6 }} />
              <Skeleton height={120} style={{ marginTop: 12 }} />
            </SkeletonCard>
            <SkeletonCard>
              <SkeletonHeading width="45%" />
              <SkeletonRows count={4} icon={false} />
            </SkeletonCard>
          </Col>
          <Col xs={12} lg={5}>
            <SkeletonChartCard height={260} />
          </Col>
        </Row>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell>
        <Alert color="danger" className="small">
          {t("common.failedToLoad")}
        </Alert>
      </PageShell>
    );
  }

  /**
   * One row: what it is, what it costs, and whether it is in the plan.
   *
   * The switch sits at the right and the amount is plain. A tick down the left
   * edge made the column read as a form, and colouring every amount in a list
   * of costs said nothing the heading had not already said.
   */
  /** "Dec — Apr · every year", for a line that only runs part of the year. */
  const seasonLabel = (line: BudgetLine | undefined) => {
    if (!line?.from && !line?.to) return undefined;
    const name = (key: string | undefined) => (monthStart(key) ? seasonFmt.format(monthStart(key)!) : undefined);
    const from = name(line?.from);
    const to = name(line?.to);
    // A yearly season with no closing month is a single month — one trip in
    // August — so it reads as that month rather than as "from August on".
    const span = from && to ? `${from} — ${to}` : from ? (line?.yearly ? from : t("planner.seasonFromOnly", { month: from })) : t("planner.seasonToOnly", { month: to });
    if (!line?.yearly) return span;

    const stop = monthStart(line.until);
    const yearly = `${span} · ${t("planner.seasonYearlyTag")}`;
    return stop ? `${yearly} ${t("planner.seasonToOnly", { month: seasonYearFmt.format(stop) })}` : yearly;
  };

  const renderRow = (row: PlanRow, onEdit?: () => void, hintOverride?: string) => {
    const season = row.source === "line" ? seasonLabel(lines.find((l) => l.id === row.id)) : undefined;
    // The salary row has no document behind it, so its label is an internal id
    // rather than something a screen reader should ever read out.
    const title = row.source === "salary" ? t("planner.salaryLabel") : row.label;
    // A zero row says why it is zero. "×0" would be true and useless.
    // A monthly figure is charged pro rata, so €400 a month lands as €360 with
    // twenty-seven days of the month left. Printing the rate alone made that
    // look like a mistake; the multiplier is what makes the row add up.
    const monthly = t("planner.perMonthShort", { amount: formatCurrency(Math.abs(row.perMonth ?? 0)) });
    const hint = hintOverride
      ? hintOverride
      : !row.enabled
      ? t("planner.offRow")
      : row.note
        ? t(`planner.note_${row.note}`)
        : row.occurrences !== undefined
          ? t("planner.timesCount", { times: row.occurrences })
          : season
            ? `${monthly} · ${season}`
            : `${monthly} ${t("planner.timesMonths", { months: monthsLabel, count: monthsShown })}`;

    const name = (
      <>
        <span className={styles.rowTitle}>{title}</span>
        <span className={styles.rowHint}>{hint}</span>
      </>
    );

    // Off rows keep the muted treatment instead: a struck-through row tinted
    // green would be saying two things at once.
    const tone = !row.enabled ? "" : row.total > 0 ? styles.rowIncome : row.total < 0 ? styles.rowExpense : "";

    return (
      <div key={row.id} className={`${styles.rowLine} ${tone} ${row.enabled ? "" : styles.rowOff}`}>
        {onEdit ? (
          <button type="button" className={`${styles.rowName} ${styles.rowEditable}`} onClick={onEdit} aria-label={t("planner.editEntry")}>
            {name}
          </button>
        ) : (
          <span className={styles.rowName}>{name}</span>
        )}

        {/* An off row shows a dash rather than €0.00: nothing is being spent,
            and a zero looks like an amount somebody chose. */}
        <span className={styles.rowAmount}>
          {!row.enabled ? "—" : `${row.total > 0 ? "+" : row.total < 0 ? "−" : ""}${formatCurrency(Math.abs(row.total))}`}
        </span>

        <div className={`form-check form-switch ${styles.rowSwitch}`}>
          <input className="form-check-input" type="checkbox" role="switch" checked={row.enabled} onChange={() => toggleRow(row.id)} aria-label={title} />
        </div>
      </div>
    );
  };

  const sweep = (rows: PlanRow[]) =>
    rows.length > 1 ? { sweepLabel: rows.every((r) => r.enabled) ? t("planner.skipAll") : t("planner.includeAll"), onSweep: () => setAll(rows, !rows.every((r) => r.enabled)) } : {};

  // The salary as a row like every other — its switch, and "1.450,00 € · on
  // the 30th · ×3" under it — opening its own dialog for the amount and day.
  const salaryRow = incomeRows.find((r) => r.source === "salary");
  const salaryHint =
    salaryRow && salary
      ? !salaryRow.enabled
        ? t("planner.offRow")
        : `${formatCurrency(salary.amount)} · ${t("planner.salaryOnDay", { day: salary.dayOfMonth })} · ${t("planner.timesCount", { times: salaryRow.occurrences ?? 0 })}`
      : undefined;
  const lineIncomeRows = incomeRows.filter((r) => r.source !== "salary");

  return (
    <PageShell>
      {cardOutOfSight && (
        <AnswerStrip
          outlook={outlook}
          endingBalance={plan.endingBalance}
          end={plan.end}
          scenario={!fromBanks}
          onOpen={backToCard}
          now={now}
          formatCurrency={formatCurrency}
          locale={lang}
        />
      )}

      {/* The day, as on the Overview: a date is what a page about the weeks
          ahead is opened to learn. */}
      <div className="mb-3">
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("planner.title")}</h1>
        <p className="small text-body-secondary mb-0">{new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }).format(now)}</p>
      </div>

      <Row className="g-3">
        <Col xs={12} lg={7}>
          <PlannerPaydayCard
            cardRef={setCardElement}
            outlook={outlook}
            steps={cardSteps}
            fromBanks={fromBanks}
            available={available}
            source={balanceSource}
            banks={banksNow}
            inGoals={inGoals}
            opening={balanceFrom}
            realLeft={realLeft}
            openingInput={openingInput}
            onOpening={setOpeningInput}
            onOpeningSource={setOpeningSource}
            unconfirmed={unconfirmed}
            onAnswer={answer}
            onOccurrence={setOpenOccurrence}
            onSetPayday={() => setEditingSalary(true)}
            baseCurrency={baseCurrency}
            now={now}
            formatCurrency={formatCurrency}
            locale={lang}
          />

          <PeriodCard
            plan={plan}
            cycles={cycles}
            horizon={horizon}
            onHorizon={setHorizon}
            scenario={!fromBanks}
            now={now}
            formatCurrency={formatCurrency}
            locale={lang}
            onOccurrence={setOpenOccurrence}
          />

          {/* Stacked on a phone, the levers sat below the whole timeline, so
              changing a number meant scrolling past every month to reach it.
              These two switch between them instead. There is deliberately no
              third "both" tab: on a phone that is the scroll this replaced, and
              on a laptop both panes are already side by side, which is why the
              switch itself is gone from lg up. */}
          <div className={`${segmented.group} ${segmented.even} d-lg-none mb-3`} role="tablist">
            <button type="button" role="tab" aria-selected={pane === "months"} className={`${segmented.item} ${pane === "months" ? segmented.active : ""}`} onClick={() => setPane("months")}>
              {t("planner.paneMonths")}
            </button>
            <button type="button" role="tab" aria-selected={pane === "numbers"} className={`${segmented.item} ${pane === "numbers" ? segmented.active : ""}`} onClick={() => setPane("numbers")}>
              {t("planner.paneNumbers")}
            </button>
          </div>

          <div className={pane === "months" ? "" : "d-none d-lg-block"}>
            <PlannerTimeline
              months={months}
              bills={bills}
              breakingEvent={plan.breakingEvent}
              formatCurrency={formatCurrency}
              dateFmt={dateFmt}
              locale={lang}
              today={now}
              settled={settled}
              onOccurrence={setOpenOccurrence}
            />
          </div>
        </Col>

        <Col xs={12} lg={5} className={pane === "numbers" ? "" : "d-none d-lg-block"}>
          {/* On a phone the switch above names this pane; side by side it needs its own. */}
          <div className={`${styles.label} d-none d-lg-block mb-2`}>{t("planner.paneNumbers")}</div>
          {/* Every lever, folded. Each group says what it costs before it says
              what it is made of. */}
          <div className="card px-3 px-lg-4">
            <LeverGroup
              title={t("planner.moneyIn")}
              total={plan.incomeTotal}
              formatCurrency={formatCurrency}
              open={!!open.income}
              onToggle={() => toggleGroup("income")}
              onAdd={() => setEditor({ mode: "line", kind: "income", draft: { label: "", amount: "" } })}
              addLabel={t("planner.addIncomeLine")}
              {...sweep(incomeRows)}
            >
              {/* Salary is the one row the app can only guess at, so it opens
                  its amount and day rather than being merely switchable. */}
              {salaryRow ? (
                renderRow(salaryRow, () => setEditingSalary(true), salaryHint)
              ) : (
                <div className={styles.rowLine}>
                  <button type="button" className={`${styles.rowName} ${styles.rowEditable}`} onClick={() => setEditingSalary(true)}>
                    <span className={styles.rowTitle}>{t("planner.salaryLabel")}</span>
                    <span className={styles.rowHint}>{t("planner.salaryMissing")}</span>
                  </button>
                  <FiChevronRight size={15} className="text-body-secondary flex-shrink-0" aria-hidden />
                </div>
              )}

              {lineIncomeRows.map((row) => renderRow(row, editHandler(row)))}

              {/* Extra pay lives with the pay, not in a section of its own: it
                  is the same question — what arrives — asked about a date
                  rather than about every month.
                  Listed from what is stored, not from what the window caught:
                  entering "€1,400 on 20 December" while the horizon is one
                  month used to save it and show nothing at all, which is
                  indistinguishable from the app having refused it. */}
              {oneOffsByDate.map((source) => {
                const row = oneOffRows.find((r) => r.id === source.id);
                // The next one still to come — which for a repeat is not the
                // date it was entered on, and is what says whether it has
                // finished or is merely outside the months on screen.
                const next = nextOneOffDate(source, startOfToday);
                // Nothing to come: the day it stopped, or failing that the day it started.
                const date = next ?? oneOffDate(source.until ?? "") ?? oneOffDate(source.date)!;
                const past = !next;
                const cadence = repeatMonths(source.every);
                const cadenceText = cadence ? t(repeatLabel(cadence).key, { count: repeatLabel(cadence).count }) : undefined;
                const edit = () =>
                  setEditor({
                    mode: "oneoff",
                    draft: { id: source.id, label: source.label, amount: String(source.amount), date: source.date, every: cadence, until: source.until },
                  });

                // A repeat says its cadence and how many times the window
                // catches it, because the amount beside it is the total of
                // those rather than one payment.
                if (row)
                  return (
                    <div key={source.id}>
                      {renderRow(row, edit, cadenceText ? `${cadenceText} · ${t("planner.timesCount", { times: row.occurrences })}` : longDateFmt.format(date))}
                    </div>
                  );

                // Nothing in this window to include or skip, so no switch: a
                // control that changes no figure is furniture.
                return (
                  <div key={source.id} className={`${styles.rowLine} ${styles.rowMuted}`}>
                    <button type="button" className={`${styles.rowName} ${styles.rowEditable}`} onClick={edit} aria-label={t("planner.editEntry")}>
                      <span className={styles.rowTitle}>{source.label}</span>
                      <span className={styles.rowHint}>
                        {cadenceText ? `${cadenceText} · ${longDateFmt.format(date)}` : longDateFmt.format(date)}{" "}
                        <span className={styles.oneOffTag} title={t(past ? "planner.oneOffPastHint" : "planner.oneOffOutOfRangeHint")}>
                          {t(past ? "planner.oneOffPast" : "planner.oneOffOutOfRange")}
                        </span>
                      </span>
                    </button>
                    <span className={styles.rowAmount}>+{formatCurrency(source.amount)}</span>
                    <span className={styles.rowSwitch} aria-hidden />
                  </div>
                );
              })}

              <button type="button" className={styles.addLine} onClick={() => setEditor({ mode: "oneoff", draft: { label: "", amount: "", date: "" } })}>
                <FiPlus size={13} /> {t("planner.addOneOff")}
              </button>
            </LeverGroup>

            <LeverGroup
              title={t("planner.groupBills")}
              count={billRows.length}
              total={sumOf(billRows)}
              formatCurrency={formatCurrency}
              open={!!open.bills}
              onToggle={() => toggleGroup("bills")}
              {...sweep(billRows)}
            >
              {billRows.length === 0 ? (
                <p className="text-body-secondary mb-1" style={{ fontSize: 12 }}>
                  {t("planner.noBillsAtAll")}
                </p>
              ) : (
                billRows.map((row) => renderRow(row))
              )}
            </LeverGroup>

            <LeverGroup
              title={t("planner.groupGoals")}
              count={goalRows.length}
              total={sumOf(goalRows)}
              formatCurrency={formatCurrency}
              open={!!open.goals}
              onToggle={() => toggleGroup("goals")}
              {...sweep(goalRows)}
            >
              {goalRows.length === 0 ? (
                <p className="text-body-secondary mb-1" style={{ fontSize: 12 }}>
                  {t("planner.noGoalsAtAll")}
                </p>
              ) : (
                goalRows.map((row) => renderRow(row))
              )}
            </LeverGroup>

            {debtRows.length > 0 && (
              <LeverGroup
                title={t("debts.plannerGroup")}
                count={debtRows.length}
                total={sumOf(debtRows)}
                formatCurrency={formatCurrency}
                open={!!open.debts}
                onToggle={() => toggleGroup("debts")}
                {...sweep(debtRows)}
              >
                {debtRows.map((row) => renderRow(row))}
              </LeverGroup>
            )}

            <LeverGroup
              title={t("planner.groupMine")}
              count={budgetRows.length}
              total={sumOf(budgetRows)}
              formatCurrency={formatCurrency}
              open={!!open.mine}
              onToggle={() => toggleGroup("mine")}
              onAdd={() => setEditor({ mode: "line", kind: "expense", draft: { label: "", amount: "" } })}
              addLabel={t("planner.addExpenseLine")}
              {...sweep(budgetRows)}
            >
              {budgetRows.length === 0 ? (
                <p className="text-body-secondary mb-1" style={{ fontSize: 12 }}>
                  {t("planner.noLinesYet")}
                </p>
              ) : (
                budgetRows.map((row) => renderRow(row, editHandler(row)))
              )}
            </LeverGroup>
          </div>
        </Col>
      </Row>

      {editor && (
        <EntryEditor
          mode={editor.mode}
          draft={editor.draft}
          onDelete={editor.draft.id ? () => deleteEntry(editor) : undefined}
          onSave={(draft) => saveEntry(editor, draft)}
          onClose={() => setEditor(null)}
        />
      )}
      {editingSalary && (
        <SalaryEditor
          input={salaryInput}
          onInput={setSalaryInput}
          detected={detectedSalary}
          isManual={salaryIsManual}
          baseCurrency={baseCurrency}
          formatCurrency={formatCurrency}
          onClose={() => setEditingSalary(false)}
        />
      )}
      {occurrence && (
        <OccurrenceSheet
          occurrence={occurrence}
          label={occurrence.label === SALARY_ROW_ID ? t("planner.salaryLabel") : occurrence.label}
          override={overrides[occurrence.key]}
          baseCurrency={baseCurrency}
          formatCurrency={formatCurrency}
          dateFmt={dateFmt}
          onSave={(value) => saveOverride(occurrence.key, value)}
          onClose={() => setOpenOccurrence(null)}
        />
      )}
    </PageShell>
  );
}

export default PlannerPage;
