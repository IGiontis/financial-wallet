import { useContext, useMemo, useState, type ReactNode } from "react";
import { useSavedFlash } from "../../shared/feedback/saveFeedback";
import { Link, Navigate, UNSAFE_LocationContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../../shared/components/Skeletons";
import { Button } from "reactstrap";

import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useDebts, useDeleteClosedDebts, useHealDebtCash } from "./useDebts";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { debtsByPerson, forgivenTag, payoffOrder } from "./debtsUtils";
import { archivedDebts, balanceShares, closedDeletePlan, closedOn, debtPath, debtSides, personPath, type SideRow } from "./debtSides";
import { ConfirmSheet } from "../incomes/components/ConfirmSheet";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { answerOrLetGo } from "../../shared/utils/pendingRecords";
import { toast } from "react-toastify";
import { DebtOrder } from "./DebtOrder";
import AddDebtModal from "./AddDebtModal";
import styles from "./css/DebtsPage.module.css";
import { PageShell } from "../../shared/components/PageShell";
import { PageTabs } from "../../shared/components/PageTabs";
import { usePageTab } from "../../shared/hooks/usePageTab";
import { pageTabIds } from "../../shared/utils/pageTabIds";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { AddHeader } from "../../shared/components/AddButton";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import { PageWaiting } from "../../shared/components/PageWaiting";
import { useLoadMore } from "../../shared/hooks/useLoadMore";
import { toneChip } from "../../shared/utils/tone";
import { localeUpperCase } from "../../shared/utils/upperCase";
import { dateFormat } from "../../shared/utils/dates";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";

/**
 * Who you owe, and who owes you — «Ζυγαριά» (owner's pick, 2026-11-16).
 *
 * Kept out of transactions on purpose: borrowed money is not income and
 * repaying is not spending, so letting either into the ledger would distort
 * every average on the Analytics screen. The Planner reads the one half that
 * genuinely has to be found from somewhere — what you owe.
 *
 * Three tabs: the scale (what is open, both sides), the order to attack the
 * loans in, and the archive of what is closed. Nothing here counts anew: the
 * figures are `debtsByPerson` / `debtTotals`, as before.
 */
const TABS = ["overview", "plan", "archive"] as const;
type DebtTab = (typeof TABS)[number];
const TABS_BASE = "debts";
/** The archive draws this many at a time (`useLoadMore`). */
const ARCHIVE_PAGE = 30;

/** Two letters for the circle: the first of the first two words, or the first two of one. */
function initialsOf(name: string, lang: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[1]].map((w) => Array.from(w)[0]) : Array.from(words[0] ?? "").slice(0, 2);
  return localeUpperCase(letters.join(""), lang);
}

export function DebtsPage() {
  // A link from elsewhere («Αλλάζει από τα Δάνεια» on a transaction) arrives
  // with the person to open, in the route's state rather than the address: it
  // lands on their page now. Here, before the list's tab hook, which would put
  // the address back. Read from the context, not useLocation(), which throws
  // outside a router.
  const arrivedFor = (useContext(UNSAFE_LocationContext)?.location?.state as { person?: string } | null | undefined)?.person;
  if (arrivedFor) return <Navigate to={personPath(arrivedFor)} replace />;
  return <DebtsList />;
}

function DebtsList() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();

  const debtsQuery = useDebts();
  const { data: debts = [] } = debtsQuery;
  // The skeleton for a few seconds at most, then the page — see `usePageLoad`.
  const load = usePageLoad(noAnswerYet(debtsQuery));
  // The person whose debt was just saved (made, edited, a repayment) lights
  // once the form has gone — `celebrateSave({ collection: "debts", id })`.
  const debtFlash = useSavedFlash("debts", useMemo(() => debts.map((d) => d.id), [debts]));
  // Money a lost signal left out of step with its debt, put right on arrival.
  const transactionsQuery = useTransactions();
  useHealDebtCash(debtsQuery, transactionsQuery);
  const [tab, setTab] = usePageTab(TABS, "overview", "debts:tab");
  const [adding, setAdding] = useState(false);
  // «Αρχείο» → «Επιλογή»: closed debts picked to delete, their money kept.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const removeClosed = useDeleteClosedDebts();
  const deleteGuard = useOfflineGuard("delete");
  // The floating «+» adds a debt or a loan here.
  usePageAdd(t("debts.add"), () => setAdding(true));

  const people = useMemo(() => debtsByPerson(debts), [debts]);
  const sides = useMemo(() => debtSides(people), [people]);
  const archive = useMemo(() => archivedDebts(debts), [debts]);
  const { limit: archiveLimit, hasMore: archiveHasMore, sentinel: archiveSentinel } = useLoadMore(archive.length, ARCHIVE_PAGE, archive.length);
  const { totals } = sides;

  if (load === "loading") {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <SkeletonStats count={1} />
        <SkeletonRows count={4} />
      </PageShell>
    );
  }
  // Still nothing after the skeleton's time: the add, and a quiet line — not «no debts», which
  // nobody has checked yet. The list replaces it the moment it arrives.
  if (load === "waiting") {
    return (
      <PageShell>
        <AddHeader label={t("debts.add")} onAdd={() => setAdding(true)} title={t("debts.title")} subtitle={t("debts.subtitle")} />
        <PageWaiting />
        {adding && <AddDebtModal knownPeople={[]} onClose={() => setAdding(false)} />}
      </PageShell>
    );
  }

  const dayFmt = dateFormat("day", lang);
  const shares = balanceShares(totals);
  // Signed, because the sign is the answer. Zero takes no sign and no colour —
  // "+€0.00" reads as a tiny win rather than as nothing owed either way.
  const netTone = totals.net > 0 ? "var(--color-income-text)" : totals.net < 0 ? "var(--color-expense-text)" : undefined;
  const netText = totals.net === 0 ? formatCurrency(0) : `${totals.net > 0 ? "+" : "−"}${formatCurrency(Math.abs(totals.net))}`;
  const rowFlash = (ids: string[]) => ids.map((id) => debtFlash(id)).find(Boolean) ?? "";

  const panel = (which: DebtTab, body: ReactNode) => {
    const ids = pageTabIds(TABS_BASE, which);
    return (
      <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} tabIndex={0} className={styles.panel}>
        {body}
      </div>
    );
  };

  const sideRow = (row: SideRow) => {
    const tone = row.direction === "owed_by_me" ? "expense" : "income";
    return (
      <li key={`${row.direction}-${row.person}`}>
        <Link to={`${row.to}${row.loan ? "" : "?tab=open"}`} className={`${styles.sideRow} ${rowFlash(row.ids)}`}>
          <span className={styles.initials} style={toneChip(tone)} aria-hidden>
            {initialsOf(row.person, lang)}
          </span>
          <span className={styles.sideMain}>
            <span className={styles.sideName}>{row.person}</span>
            <span className={styles.sideSub}>{row.label ?? t("debts.loanCount", { count: row.count })}</span>
            {/* How much of it is gone — principal repaid over what started it. */}
            <span className={styles.sideBar} aria-hidden>
              <span style={{ width: `${row.cleared}%` }} />
            </span>
          </span>
          <span className={styles.sideFigures}>
            <span className={styles.sideAmount} style={{ color: `var(--color-${tone}-text)` }}>
              {formatCurrency(row.amount)}
            </span>
            <span className={styles.sidePct}>{t("debts.receiptCleared", { percent: row.cleared })}</span>
          </span>
        </Link>
      </li>
    );
  };

  const side = (direction: "owe" | "owed") => {
    const rows = direction === "owe" ? sides.owe : sides.owed;
    const total = direction === "owe" ? totals.owedByMe : totals.owedToMe;
    const headId = `debts-side-${direction}`;
    return (
      <section className={`${styles.card} ${styles.side} p-3 p-lg-4`} aria-labelledby={headId} data-tour={direction === "owe" ? "debts-people" : undefined}>
        <h2 id={headId} className={`stat-head ${styles.sideHead}`}>
          <span>{t(direction === "owe" ? "debts.sideOwe" : "debts.sideOwed")}</span>
          <span className={styles.sideHeadFigure}>{formatCurrency(total)}</span>
        </h2>
        {rows.length === 0 ? (
          <p className={styles.sideEmpty}>{t(direction === "owe" ? "debts.filterEmptyOwe" : "debts.filterEmptyOwed")}</p>
        ) : (
          <ul className={styles.sideList}>{rows.map(sideRow)}</ul>
        )}
      </section>
    );
  };

  const overview =
    debts.length === 0 ? (
      // Nothing at all yet: an invitation with the page's add (rule 7), as Bills and Goals have.
      <div className={`${styles.card} text-center text-body-secondary p-4`}>
        <p className="mb-3" style={{ fontSize: "var(--fs-text)" }}>
          {t("debts.empty")}
        </p>
        <Button color="primary" onClick={() => setAdding(true)}>
          + {t("debts.add")}
        </Button>
      </div>
    ) : (
      <>
        {/* The scale: what you owe in red, what you are owed in green, the bar
            split between them in proportion, and the net in the middle. */}
        <section className={`${styles.card} ${styles.balance}`} aria-label={t("debts.balanceLabel")}>
          <div className={styles.balanceOwe}>
            <span className={styles.balanceLabel}>{t("debts.youOwe")}</span>
            <span className={styles.balanceFigure} style={{ color: "var(--color-expense-text)" }}>
              {formatCurrency(totals.owedByMe)}
            </span>
          </div>
          <div className={styles.balanceNet}>
            <span className={styles.balanceLabel}>{t("debts.netShort")}</span>
            <span className={styles.balanceFigure} style={{ color: netTone }}>
              {netText}
            </span>
            <span className={styles.balanceNote}>{t(totals.net > 0 ? "debts.netAhead" : totals.net < 0 ? "debts.netBehind" : "debts.netEven")}</span>
          </div>
          <div className={styles.balanceOwed}>
            <span className={styles.balanceLabel}>{t("debts.balanceOwed")}</span>
            <span className={styles.balanceFigure} style={{ color: "var(--color-income-text)" }}>
              {formatCurrency(totals.owedToMe)}
            </span>
          </div>
          <div className={styles.balanceBar} aria-hidden>
            {shares.owe > 0 && <span className={styles.balanceBarOwe} style={{ width: `${shares.owe}%` }} />}
            {shares.owed > 0 && <span className={styles.balanceBarOwed} style={{ width: `${shares.owed}%` }} />}
          </div>
        </section>

        <div className="row g-3">
          <div className="col-12 col-lg-6">{side("owe")}</div>
          <div className="col-12 col-lg-6">{side("owed")}</div>
        </div>
      </>
    );

  // Which loan to put spare money against first — moved here unchanged; only a loan that charges interest has one.
  const plan =
    payoffOrder(debts).length > 0 ? (
      <DebtOrder debts={debts} formatCurrency={formatCurrency} />
    ) : (
      <div className={`${styles.card} p-3 p-lg-4`}>
        <p className={styles.sideEmpty}>{t("debts.planEmpty")}</p>
      </div>
    );

  // Settled, forgiven, cancelled: kept whole, out of the way, the latest closed first.
  const archiveRowContent = (d: DebtWithStatus) => {
    const borrowed = d.direction === "owed_by_me";
    const name = d.label || t(borrowed ? "debts.iBorrowed" : "debts.iLent");
    const tag = t(d.forgiven ? forgivenTag(d) : "debts.settled");
    return (
      <>
        <span className={`${styles.initials} ${styles.initialsClosed}`} aria-hidden>
          {initialsOf(d.person, lang)}
        </span>
        <span className={styles.sideMain}>
          <span className={styles.sideName}>{d.person.trim()}</span>
          <span className={styles.sideSub}>
            {name} · {tag} {dayFmt.format(closedOn(d))}
          </span>
        </span>
        <span className={styles.sideFigures}>
          <span className={styles.sideAmount}>{formatCurrency(d.amount)}</span>
          <span className={styles.sidePct}>{t(borrowed ? "debts.took" : "debts.gave")}</span>
        </span>
      </>
    );
  };
  const toggle = (id: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const archiveRow = (d: DebtWithStatus) => (
    <li key={d.id}>
      {selecting ? (
        // Picking: the row is its checkbox's label, the box on the right.
        <label className={`${styles.sideRow} ${styles.sideRowPick} ${rowFlash([d.id])}`}>
          {archiveRowContent(d)}
          <input type="checkbox" className={`form-check-input ${styles.pickBox}`} checked={picked.has(d.id)} onChange={() => toggle(d.id)} aria-label={`${d.person.trim()} · ${d.label || t(d.direction === "owed_by_me" ? "debts.iBorrowed" : "debts.iLent")}`} />
        </label>
      ) : (
        <Link to={`${debtPath(d)}${debtPath(d).startsWith("/debts/person/") ? "?tab=settled" : ""}`} className={`${styles.sideRow} ${rowFlash([d.id])}`}>
          {archiveRowContent(d)}
        </Link>
      )}
    </li>
  );

  // Only what is still in the archive counts as picked (a debt deleted elsewhere drops out).
  const pickedDebts = archive.filter((d) => picked.has(d.id));
  const allPicked = archive.length > 0 && pickedDebts.length === archive.length;
  const deletePlan = closedDeletePlan(pickedDebts, transactionsQuery.data ?? []);
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  // Online only: the question stays up, locked, until the answer — 7 s at most
  // (`answerOrLetGo`); then it lets go, the rows stay pending, and the toast
  // with the counts comes with the answer. A failure is said by the hook.
  const deletePicked = () => {
    const ids = pickedDebts.map((d) => d.id);
    return answerOrLetGo(() => removeClosed.mutateAsync(ids), {
      records: ids.map((id) => ["debts", id] as [string, string]),
      close: () => {
        setConfirming(false);
        stopSelecting();
      },
      succeeded: (done) => {
        toast.success(t("debts.archiveDeleted", { count: done.debtIds.length }));
        if (done.skipped.length > 0) toast.info(t("debts.archiveSkipped", { count: done.skipped.length }));
      },
    });
  };

  const archived =
    archive.length === 0 ? (
      <div className={`${styles.card} p-3 p-lg-4`}>
        <p className={styles.sideEmpty}>{t("debts.archiveEmpty")}</p>
      </div>
    ) : (
      <section className={`${styles.card} p-3 p-lg-4`} aria-label={t("debts.tabArchive")}>
        <div className={styles.archiveHead}>
          <p className={styles.archiveNote}>{t("debts.archiveNote")}</p>
          <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {t(selecting ? "common.cancel" : "debts.archiveSelect")}
          </button>
        </div>
        {selecting && (
          <label className={styles.pickAll}>
            <span>{t("debts.archiveAll")}</span>
            <input type="checkbox" className={`form-check-input ${styles.pickBox}`} checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(archive.map((d) => d.id)))} />
          </label>
        )}
        <ul className={styles.sideList}>{archive.slice(0, archiveLimit).map(archiveRow)}</ul>
        {archiveHasMore && <div ref={archiveSentinel} aria-hidden />}
        {selecting && (
          // At the foot of the screen while the list scrolls: how many, and the delete.
          <div className={styles.selectBar} role="status">
            <span>{t("debts.archivePicked", { count: pickedDebts.length })}</span>
            <DeleteButton opensConfirm onClick={() => setConfirming(true)} disabled={pickedDebts.length === 0 || deleteGuard.locked} title={deleteGuard.reason} />
          </div>
        )}
      </section>
    );

  return (
    <PageShell>
      <AddHeader label={t("debts.add")} onAdd={() => setAdding(true)} title={t("debts.title")} subtitle={t("debts.subtitle")} />
      <PageTabs
        base={TABS_BASE}
        label={t("debts.title")}
        tabs={[
          { id: "overview", label: t("debts.tabOverview") },
          { id: "plan", label: t("debts.tabPlan") },
          { id: "archive", label: archive.length > 0 ? t("debts.tabArchiveCount", { count: archive.length }) : t("debts.tabArchive") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "overview" && panel("overview", overview)}
      {tab === "plan" && panel("plan", plan)}
      {tab === "archive" && panel("archive", archived)}

      {adding && <AddDebtModal knownPeople={people.map((p) => p.person)} onClose={() => setAdding(false)} />}
      {confirming && (
        <ConfirmSheet
          title={t("debts.archiveDeleteTitle", { count: deletePlan.debts })}
          body={t("debts.archiveDeleteBody", { count: deletePlan.debts, repayments: deletePlan.repayments })}
          hint={
            <>
              {t("debts.archiveDeleteKeeps", { count: deletePlan.keptMoney })}
              {deletePlan.covered > 0 && <span className="d-block mt-1">{t("debts.archiveDeleteCovered", { count: deletePlan.covered })}</span>}
            </>
          }
          confirmLabel={t("common.delete")}
          lockedReason={deleteGuard.reason}
          onConfirm={deletePicked}
          onClose={() => setConfirming(false)}
        />
      )}
    </PageShell>
  );
}

export default DebtsPage;
// A person's / a bank loan's own page, in this page's chunk (`lib/lazyRoutes.ts`).
export { DebtPersonPage } from "./DebtPersonPage";
