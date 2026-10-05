import { useMemo, useState } from "react";
import { Button, Col, Row } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { addMonths, startOfMonth } from "date-fns";
import { PageShell } from "../../shared/components/PageShell";
import { SkeletonCard, SkeletonHeading, SkeletonRows, Skeleton } from "../../shared/components/Skeletons";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useNarrowScreen } from "../../shared/hooks/useNarrowScreen";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { toISOMonth } from "../../shared/utils/dates";
import { useCategories, useDeleteTransaction } from "../transactions/hooks/useTransactions";
import { useAccountList } from "../accounts/useMoneyAccounts";
import { mainAccount } from "../accounts/accountsUtils";
import { useDeclinedSalaries, useIncomes, useRecordArrival } from "./useIncomes";
import {
  KIND_ICON,
  expectedAmount,
  incomeArrivals,
  incomeRows,
  incomeWindow,
  incomeYear,
  isActiveIncome,
  monthSummary,
  salarySuggestion,
  suggestIncomeCategory,
  type Income,
  type IncomeArrival,
  type IncomeStatus,
} from "./incomesUtils";
import { emptyDraft, incomeToDraft, type DraftStep, type IncomeDraft } from "./incomeForm";
import { makeFormats } from "./incomeText";
import { IncomeMonthCard, IncomeTiles } from "./components/IncomeMonthCard";
import { IncomeList } from "./components/IncomeList";
import { IncomeCalendar } from "./components/IncomeCalendar";
import { IncomeYearCard } from "./components/IncomeYearCard";
import ArrivedSheet from "./components/ArrivedSheet";
import IncomeCard from "./components/IncomeCard";
import IncomeFormModal from "./components/IncomeFormModal";
import { ConfirmSheet } from "./components/ConfirmSheet";
import segmented from "../../shared/css/Segmented.module.css";
import styles from "./css/IncomesPage.module.css";

// «Έσοδα»: the one place the regular money in lives — salary, a rent you
// collect, an allowance, a pension, a steady second job. The Planner and the
// Overview are to read it from here (phase 2) rather than keep copies.
//
// Option 1 of the design, «Λίστα σαν τα Πάγια», as the base: the month on
// top, then «Περιμένεις» and «Ήρθαν». The month card carries option 3's bar,
// split per income; a second tab shows option 2's calendar of the month; and
// tapping an income opens option 4's card with its six-month history. «Η
// χρονιά» sits beside the list on a desktop and is the third tab on a phone,
// as on the Bills page.

type IncomesView = "list" | "calendar" | "year";

interface FormState {
  draft: IncomeDraft;
  isEdit: boolean;
  step?: DraftStep;
  /** A fresh sheet every time it opens, rather than one remembering the last. */
  key: number;
}

/**
 * What waits for a yes. `back` is the income whose card the question was asked
 * from: the card makes way for the question, and comes back after it.
 */
type Confirming = { kind: "delete"; income: Income; back?: string } | { kind: "undo"; income: Income; arrival: IncomeArrival; back?: string };

interface ArrivingState {
  incomeId: string;
  status: IncomeStatus;
  /** From «Ναι, ήταν μέσα»: the reading the money was already in. */
  readingAt?: Date;
}

export default function IncomesPage() {
  const { t, i18n } = useTranslation();
  const f = useMemo(() => makeFormats(i18n.resolvedLanguage ?? "en"), [i18n.resolvedLanguage]);
  const { format: formatCurrency, convert } = useCurrencyConverter();
  const { incomes, statuses, transactions, lastReadingAt, now, isLoading, saveIncome, removeIncome, setOverride } = useIncomes();
  const { data: categories = [] } = useCategories();
  const accounts = useAccountList();
  const main = mainAccount(accounts);
  const recordArrival = useRecordArrival();
  const deleteTransaction = useDeleteTransaction();
  const deleteGuard = useOfflineGuard("delete");
  const [declined, decline] = useDeclinedSalaries();

  // Below the desktop breakpoint the year is a tab rather than a column, so it
  // is never mounted twice. Per device: how you like to read is not a fact
  // about your money.
  const compact = useNarrowScreen("(max-width: 991.98px)");
  const [storedView, setView] = useLocalStorage<IncomesView>("incomes-view", "list");
  const view: IncomesView = storedView === "year" && !compact ? "list" : storedView === "calendar" || storedView === "year" ? storedView : "list";

  const [form, setForm] = useState<FormState | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [arriving, setArriving] = useState<ArrivingState | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  const byId = useMemo(() => new Map(incomes.map((i) => [i.id, i])), [incomes]);
  const archived = useMemo(() => incomes.filter((i) => !isActiveIncome(i)), [incomes]);
  const summary = useMemo(() => monthSummary(statuses, toISOMonth(now)), [statuses, now]);
  const nextMonthDate = useMemo(() => startOfMonth(addMonths(now, 1)), [now]);
  const nextSummary = useMemo(() => monthSummary(statuses, toISOMonth(nextMonthDate)), [statuses, nextMonthDate]);
  const rows = useMemo(() => incomeRows(incomes, statuses, now), [incomes, statuses, now]);
  const year = useMemo(() => incomeYear(incomes, transactions, now), [incomes, transactions, now]);
  const bounds = useMemo(() => incomeWindow(now), [now]);
  const salaryIncome = incomes.find((i) => i.isSalary && isActiveIncome(i));
  // Only on an empty page, and never a second time for the same salary.
  const suggestion = useMemo(() => (incomes.length === 0 ? salarySuggestion(transactions, now, declined) : undefined), [incomes.length, transactions, now, declined]);

  const accountName = (id: string | undefined) => (id ? accounts.find((a) => a.id === id)?.name : undefined);
  const categoryFor = (income: Income) => categories.find((c) => c.id === income.categoryId && c.type === "income") ?? suggestIncomeCategory(income.kind, categories);

  // ── Opening things ────────────────────────────────────────────────────────
  // One sheet at a time: whatever opens next closes the one it came from.

  const openNew = (preset: Partial<IncomeDraft> = {}) => {
    const kind = preset.kind ?? (salaryIncome ? "other" : "salary");
    setCardId(null);
    setForm({
      draft: emptyDraft(now, { kind, name: t(`incomes.kind.${kind}`), categoryId: suggestIncomeCategory(kind, categories)?.id ?? "", isSalary: kind === "salary" && !salaryIncome, ...preset }),
      isEdit: false,
      key: Date.now(),
    });
  };

  const openEdit = (income: Income, step?: DraftStep) => {
    setCardId(null);
    setForm({ draft: incomeToDraft(income, convert, now), isEdit: true, step, key: Date.now() });
  };

  const openArrive = (income: Income, status: IncomeStatus, readingAt?: Date) => {
    setCardId(null);
    setArriving({ incomeId: income.id, status, readingAt });
  };

  // One sheet at a time here too: the question replaces the card or form it
  // was asked from.
  const askDelete = (income: Income, back?: string) => {
    setCardId(null);
    setForm(null);
    setConfirming({ kind: "delete", income, back });
  };

  const askUndo = (income: Income, arrival: IncomeArrival) => {
    setCardId(null);
    setConfirming({ kind: "undo", income, arrival, back: income.id });
  };

  const archive = (income: Income) => {
    setCardId(null);
    saveIncome({ ...income, active: false });
  };

  const closeConfirm = (reopen: boolean) => {
    if (reopen && confirming?.back && byId.has(confirming.back)) setCardId(confirming.back);
    setConfirming(null);
  };

  const confirm = () => {
    if (!confirming) return;
    if (confirming.kind === "delete") {
      removeIncome(confirming.income.id);
      closeConfirm(false);
      return;
    }
    confirming.arrival.transactions.forEach((tx) => deleteTransaction.mutate({ id: tx.id }, { onError: () => toast.error(t("incomes.card.undoFailed")) }));
    // Back to the card, which now shows the time as waiting again.
    closeConfirm(true);
  };

  const acceptSuggestion = () => {
    if (!suggestion) return;
    openNew({
      kind: "salary",
      name: t("incomes.kind.salary"),
      amount: String(Number(convert(suggestion.pattern.amount).toFixed(2))),
      day: String(suggestion.pattern.dayOfMonth),
      start: suggestion.since,
      isSalary: true,
    });
  };

  const handleBankAnswer = (income: Income, status: IncomeStatus, yes: boolean) => {
    // «Όχι ακόμα» is the Planner's «περίμενε»: an answer, so it is not asked
    // again, and the occurrence goes back to being due or late on its own day.
    if (yes) openArrive(income, status, lastReadingAt);
    else setOverride(status.key, { state: "waiting" });
  };

  const arrivingIncome = arriving ? byId.get(arriving.incomeId) : undefined;
  const cardIncome = cardId ? byId.get(cardId) : undefined;

  return (
    <PageShell>
      <div className="d-flex justify-content-between align-items-start mb-3 gap-2">
        <div style={{ minWidth: 0 }}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("incomes.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("incomes.subtitle")}</p>
        </div>
        <Button color="primary" onClick={() => openNew()} className="flex-shrink-0" aria-label={t("incomes.new")}>
          <span className="d-none d-sm-inline">+ {t("incomes.new")}</span>
          <span className="d-sm-none" aria-hidden>
            +
          </span>
        </Button>
      </div>

      {isLoading ? (
        <Row className="g-3 g-lg-4">
          <Col xs={12} lg={7} xl={8}>
            <SkeletonCard className="mb-3">
              <SkeletonHeading width="50%" />
              <Skeleton height={12} style={{ borderRadius: 6 }} />
            </SkeletonCard>
            <SkeletonRows count={4} />
          </Col>
        </Row>
      ) : incomes.length === 0 ? (
        <div className={`${styles.card} p-4 text-center mx-auto`} style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 40 }} aria-hidden>
            {KIND_ICON.salary}
          </div>
          <p className="fw-semibold mb-1">{t("incomes.empty.title")}</p>
          <p className="small text-body-secondary mb-3">{t("incomes.empty.hint")}</p>

          {suggestion && (
            <div className={`${styles.suggestion} mb-3`}>
              <div className="fw-semibold">{t("incomes.empty.foundTitle", { amount: formatCurrency(suggestion.pattern.amount), day: suggestion.pattern.dayOfMonth })}</div>
              <div className="small text-body-secondary mb-2">{t("incomes.empty.foundBody", { count: suggestion.pattern.occurrences })}</div>
              <div className="d-flex gap-2">
                <Button color="primary" size="sm" onClick={acceptSuggestion}>
                  {t("incomes.empty.add")}
                </Button>
                <Button color="secondary" outline size="sm" onClick={() => decline(suggestion.signature)}>
                  {t("incomes.empty.no")}
                </Button>
              </div>
            </div>
          )}

          <Button color="secondary" outline onClick={() => openNew()}>
            + {t("incomes.new")}
          </Button>
        </div>
      ) : (
        <Row className="g-3 g-lg-4">
          <Col xs={12} lg={7} xl={8}>
            <IncomeMonthCard summary={summary} incomes={byId} formatCurrency={formatCurrency} f={f} monthDate={now} />
            <IncomeTiles year={year} incomes={incomes} formatCurrency={formatCurrency} now={now} />

            <div className={`${segmented.group} ${segmented.even} mb-3`} role="tablist" aria-label={t("incomes.title")}>
              {(compact ? (["list", "calendar", "year"] as const) : (["list", "calendar"] as const)).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={view === tab} className={`${segmented.item} ${view === tab ? segmented.active : ""}`} onClick={() => setView(tab)}>
                  {t(`incomes.tabs.${tab}`)}
                </button>
              ))}
            </div>

            {view === "list" && (
              <IncomeList
                rows={rows}
                archived={archived}
                nextMonth={nextSummary}
                nextMonthDate={nextMonthDate}
                incomes={byId}
                formatCurrency={formatCurrency}
                accountName={accountName}
                lastReadingAt={lastReadingAt}
                f={f}
                now={now}
                onOpen={(income) => setCardId(income.id)}
                onArrive={(income, status) => openArrive(income, status)}
                onBankAnswer={handleBankAnswer}
                onSetDay={(income) => openEdit(income, 2)}
                onEdit={(income) => openEdit(income)}
                onArchive={archive}
                onRestore={(income) => saveIncome({ ...income, active: undefined })}
                onDelete={(income) => askDelete(income)}
              />
            )}

            {view === "calendar" && (
              <IncomeCalendar
                statuses={statuses}
                incomes={byId}
                formatCurrency={formatCurrency}
                f={f}
                now={now}
                bounds={bounds}
                onOpen={(income) => setCardId(income.id)}
                onArrive={(income, status) => openArrive(income, status)}
                onNotThis={(status) => setOverride(status.key, { state: "waiting" })}
                // «Νέο έσοδο στις 15;» — the «Πότε» step already says monthly, on the 15th.
                onNewOnDay={(day) => openNew({ frequency: "monthly", day: String(day) })}
              />
            )}

            {view === "year" && <IncomeYearCard year={year} formatCurrency={formatCurrency} f={f} onOpen={(income) => setCardId(income.id)} />}
          </Col>

          {!compact && (
            <Col xs={12} lg={5} xl={4}>
              <IncomeYearCard year={year} formatCurrency={formatCurrency} f={f} onOpen={(income) => setCardId(income.id)} />
            </Col>
          )}
        </Row>
      )}

      {cardIncome && (
        <IncomeCard
          income={cardIncome}
          statuses={statuses}
          expected={expectedAmount(cardIncome, transactions)}
          arrivals={incomeArrivals(cardIncome, transactions)}
          accountName={accountName(cardIncome.accountId)}
          formatCurrency={formatCurrency}
          f={f}
          now={now}
          deleteLockedReason={deleteGuard.locked ? deleteGuard.reason : undefined}
          onClose={() => setCardId(null)}
          onEdit={openEdit}
          onArrive={(income, status) => openArrive(income, status)}
          onSetOverride={setOverride}
          onUndoArrival={askUndo}
          onRestore={(income) => saveIncome({ ...income, active: undefined })}
          onArchive={archive}
          onDelete={(income) => askDelete(income, income.id)}
        />
      )}

      {arriving && arrivingIncome && (
        <ArrivedSheet
          income={arrivingIncome}
          status={arriving.status}
          options={statuses}
          expected={expectedAmount(arrivingIncome, transactions)}
          readingAt={arriving.readingAt}
          accounts={accounts}
          mainAccountId={main?.id}
          category={categoryFor(arrivingIncome)}
          f={f}
          onClose={() => setArriving(null)}
          onConfirm={(status, input) => {
            void recordArrival(arrivingIncome, status, input);
            setArriving(null);
          }}
        />
      )}

      {form && (
        <IncomeFormModal
          key={form.key}
          draft={form.draft}
          isEdit={form.isEdit}
          startStep={form.step}
          categories={categories}
          accounts={accounts}
          salaryName={salaryIncome && salaryIncome.id !== form.draft.id ? salaryIncome.name : undefined}
          f={f}
          now={now}
          onClose={() => setForm(null)}
          onSave={(income) => {
            saveIncome(income);
            setForm(null);
          }}
          onDelete={() => {
            const income = form.draft.id ? byId.get(form.draft.id) : undefined;
            if (income) askDelete(income, income.id);
            else setForm(null);
          }}
          onArchive={() => {
            const income = form.draft.id ? byId.get(form.draft.id) : undefined;
            if (income) archive(income);
            setForm(null);
          }}
        />
      )}

      {confirming?.kind === "delete" && (
        <ConfirmSheet
          title={t("incomes.confirm.deleteTitle")}
          body={t("incomes.confirm.deleteBody", { name: confirming.income.name })}
          hint={t("incomes.confirm.deleteHint")}
          confirmLabel={t("common.delete")}
          onConfirm={confirm}
          onClose={() => closeConfirm(true)}
        />
      )}

      {confirming?.kind === "undo" && (
        <ConfirmSheet
          title={t("incomes.confirm.undoTitle")}
          body={t("incomes.confirm.undoBody", { amount: formatCurrency(confirming.arrival.amount), date: f.weekdayDate.format(confirming.arrival.date), name: confirming.income.name })}
          confirmLabel={t("incomes.card.undoRecord")}
          lockedReason={deleteGuard.locked ? deleteGuard.reason : undefined}
          onConfirm={confirm}
          onClose={() => closeConfirm(true)}
        />
      )}
    </PageShell>
  );
}
