import { useMemo, useState } from "react";
import { Alert, Col, Container, Input, InputGroup, InputGroupText, Row } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonPageHeader, SkeletonRows } from "../../shared/components/Skeletons";
import { FiPlus } from "react-icons/fi";

import { useTransactions } from "../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../budget/useInvestments";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { plannableDebts } from "../debts/debtsUtils";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useDebounce } from "../../shared/hooks/useDebounce";
import { asHorizon, buildPlan, detectSalary, lineDays, monthStart, oneOffDate, type BudgetLine, type OneOff, type PlannerEvent, type PlannerHorizon, type PlanRow } from "./plannerUtils";
import PlannerHero from "./components/PlannerHero";
import PlannerTimeline from "./components/PlannerTimeline";
import LeverGroup from "./components/LeverGroup";
import EntryEditor, { type EntryDraft } from "./components/EntryEditor";
import styles from "./css/PlannerPage.module.css";

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
 * The page is arranged around that question rather than around the data behind
 * it: the answer, then the order things happen in, then the levers — folded, so
 * a phone is not handed forty rows before it is handed the one chart.
 */
export function PlannerPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const { data: transactions = [], isLoading: txLoading, isError } = useTransactions();
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
  const [storedHorizon, setHorizon] = useLocalStorage<PlannerHorizon>("planner-horizon", 1);
  const [openingInput, setOpeningInput] = useLocalStorage("planner-opening", "");
  const [storedSalary, setSalaryInput] = useLocalStorage("planner-salary", { amount: "", day: "" });
  const [storedLines, setLines] = useLocalStorage<BudgetLine[]>("planner-lines", []);
  const [storedOneOffs, setOneOffs] = useLocalStorage<OneOff[]>("planner-oneoffs", []);
  const [storedSkipped, setSkipped] = useLocalStorage<string[]>("planner-skip", []);
  const [storedOpen, setOpen] = useLocalStorage<Record<string, boolean>>("planner-open-groups", DEFAULT_OPEN);

  const horizon = asHorizon(storedHorizon);
  // Memoised because it feeds the plan: a fresh object each render would
  // rebuild the whole projection on every keystroke anywhere on the page.
  const salaryInput = useMemo(() => ({ amount: String(storedSalary?.amount ?? ""), day: String(storedSalary?.day ?? "") }), [storedSalary]);
  const lines = useMemo(
    () => (Array.isArray(storedLines) ? storedLines.filter((l): l is BudgetLine => !!l && typeof l.id === "string" && Number.isFinite(l.amount)) : []),
    [storedLines],
  );
  // Sanitised like everything else read back from storage: a bad date here
  // reached `addMonths` as NaN once and took the whole page down with it.
  const oneOffs = useMemo(
    () =>
      Array.isArray(storedOneOffs)
        ? storedOneOffs.filter((o): o is OneOff => !!o && typeof o.id === "string" && typeof o.date === "string" && Number.isFinite(o.amount) && o.amount > 0 && !!oneOffDate(o.date))
        : [],
    [storedOneOffs],
  );
  const skipped = useMemo(() => (Array.isArray(storedSkipped) ? storedSkipped.filter((s): s is string => typeof s === "string") : []), [storedSkipped]);
  const open = useMemo(() => (storedOpen && typeof storedOpen === "object" ? storedOpen : DEFAULT_OPEN), [storedOpen]);

  const [selectedDay, setSelectedDay] = useState(-1);
  // One dialog for every figure the user owns, rather than an inline editor
  // permanently unrolled under each row.
  const [editor, setEditor] = useState<{ mode: "line" | "oneoff"; kind?: "income" | "expense"; draft: EntryDraft } | null>(null);

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

  const plan = useMemo(
    () => buildPlan({ bills, goals, lines, oneOffs, debts, salary: plannedSalary, openingBalance: parseFloat(plannedOpening) || 0, skipIds, horizon, now }),
    [bills, goals, lines, oneOffs, debts, plannedSalary, plannedOpening, skipIds, horizon, now],
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

  // Two decimals would read as noise; one says "not quite a whole month".
  const monthsLabel = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(plan.monthsCovered);

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
  const oneOffsByDate = useMemo(() => [...oneOffs].sort((a, b) => a.date.localeCompare(b.date)), [oneOffs]);
  const startOfToday = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const seasonFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short" }), [lang]);

  // Only the lines running *today*: a ski budget that starts in December has
  // nothing to say about what a day in September costs.
  const monthlyLineNet = lines
    .filter((l) => !skipIds.has(l.id) && !!lineDays(l, startOfToday, 0))
    .reduce((sum, l) => sum + (l.kind === "income" ? l.amount : -l.amount), 0);
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
      ? () => setEditor({ mode: "line", kind: line.kind, draft: { id: line.id, label: line.label, amount: String(line.amount), from: line.from, to: line.to } })
      : undefined;
  };

  const saveEntry = (editor: Editor, draft: EntryDraft) => {
    const amount = parseFloat(draft.amount);

    if (editor.mode === "oneoff") {
      const label = draft.label || t("planner.oneOffFallbackName");
      const entry: OneOff = { id: draft.id ?? newId(), label, amount, date: draft.date ?? "" };
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

  if (txLoading || goalLoading || billLoading) {
    return (
      <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 1100 }}>
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
      </Container>
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

  /**
   * One row: what it is, what it costs, and whether it is in the plan.
   *
   * The switch sits at the right and the amount is plain. A tick down the left
   * edge made the column read as a form, and colouring every amount in a list
   * of costs said nothing the heading had not already said.
   */
  /** "Dec — Apr", for a line that only runs part of the year. */
  const seasonLabel = (line: BudgetLine | undefined) => {
    if (!line?.from && !line?.to) return undefined;
    const name = (key: string | undefined) => (monthStart(key) ? seasonFmt.format(monthStart(key)!) : undefined);
    const from = name(line?.from);
    const to = name(line?.to);
    return from && to ? `${from} — ${to}` : from ? t("planner.seasonFromOnly", { month: from }) : t("planner.seasonToOnly", { month: to });
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
            : `${monthly} ${t("planner.timesMonths", { months: monthsLabel })}`;

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

  return (
    <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 1100 }}>
      <div className="mb-3">
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("planner.title")}</h1>
        <p className="small text-body-secondary mb-0">{t("planner.subtitle")}</p>
      </div>

      <Row className="g-3">
        <Col xs={12} lg={7}>
          <PlannerHero
            plan={plan}
            horizon={horizon}
            onHorizon={setHorizon}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            monthlyLineNet={monthlyLineNet}
            openingInput={openingInput}
            onOpening={setOpeningInput}
            baseCurrency={baseCurrency}
            formatCurrency={formatCurrency}
            dateFmt={dateFmt}
          />

          <PlannerTimeline months={eventMonths} bills={bills} breakingEvent={plan.breakingEvent} formatCurrency={formatCurrency} dateFmt={dateFmt} />
        </Col>

        <Col xs={12} lg={5}>
          {/* Every lever, folded. Each group says what it costs before it says
              what it is made of. */}
          <div className={`${styles.chartCard} px-3 px-lg-4`}>
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
                incomeRows.map((row) => renderRow(row, editHandler(row)))
              )}

              {/* Extra pay lives with the pay, not in a section of its own: it
                  is the same question — what arrives — asked about a date
                  rather than about every month.
                  Listed from what is stored, not from what the window caught:
                  entering "€1,400 on 20 December" while the horizon is one
                  month used to save it and show nothing at all, which is
                  indistinguishable from the app having refused it. */}
              {oneOffsByDate.map((source) => {
                const row = oneOffRows.find((r) => r.id === source.id);
                const date = oneOffDate(source.date)!;
                const past = date < startOfToday;
                const edit = () => setEditor({ mode: "oneoff", draft: { id: source.id, label: source.label, amount: String(source.amount), date: source.date } });

                if (row) return <div key={source.id}>{renderRow(row, edit, `${longDateFmt.format(date)}`)}</div>;

                // Nothing in this window to include or skip, so no switch: a
                // control that changes no figure is furniture.
                return (
                  <div key={source.id} className={`${styles.rowLine} ${styles.rowMuted}`}>
                    <button type="button" className={`${styles.rowName} ${styles.rowEditable}`} onClick={edit} aria-label={t("planner.editEntry")}>
                      <span className={styles.rowTitle}>{source.label}</span>
                      <span className={styles.rowHint}>
                        {longDateFmt.format(date)}{" "}
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
    </Container>
  );
}

export default PlannerPage;
