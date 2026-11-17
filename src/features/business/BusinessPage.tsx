import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FiBriefcase, FiChevronRight, FiEdit2, FiEye, FiTrash2 } from "react-icons/fi";
import { PageShell } from "../../shared/components/PageShell";
import { AddHeader } from "../../shared/components/AddButton";
import { PageTabs } from "../../shared/components/PageTabs";
import { RowMenu } from "../../shared/components/RowMenu";
import { InfoLegend } from "../../shared/components/InfoLegend";
import { SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../../shared/components/Skeletons";
import { useSavedFlash } from "../../shared/feedback/saveFeedback";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLoadMore } from "../../shared/hooks/useLoadMore";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { usePageTab } from "../../shared/hooks/usePageTab";
import { useAccessState } from "../../shared/hooks/useHasAccess";
import { pageTabIds } from "../../shared/utils/pageTabIds";
import { firestoreToDate, dateFormat } from "../../shared/utils/dates";
import { NotFoundPage } from "../errors/NotFoundPage";
import { GoalPickMenu } from "../budget/components/GoalPickMenu";
import type { Business, BusinessEntry } from "../../shared/types/IndexTypes";
import { closingFigures, expenseLineClosings, forBusiness, lossDays, monthByExpenseLine, monthEntries, monthStart, monthSummary, type BusinessMonth, type ExpenseLineTotal } from "./businessSummary";
import { businessOf, lineName, profitTone, signed } from "./businessFormat";
import { MonthNav } from "./businessShared";
import { useBusinessEntries, useBusinesses, useDeleteBusiness, useDeleteClosing } from "./useBusiness";
import ClosingWizard from "./ClosingWizard";
// «Νέο κλείσιμο» (`/business/new`) rides in this page's chunk (`lazyRoutes`).
export { NewClosingPage } from "./NewClosingPage";
import BusinessWizard from "./BusinessWizard";
import { BusinessDeleteModal, BusinessEntryView } from "./BusinessEntryView";
import { BusinessesTab, DeleteBusinessModal, FirstBusinessInvite } from "./BusinessesTab";
import { BUSINESSES_KEY, BUSINESSES_MAX } from "./businessKeys";
import { PageWaiting } from "../../shared/components/PageWaiting";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import { useWorkspaceMissing } from "../../shared/hooks/useWorkspaceSetting";
import { BusinessCalendar } from "./BusinessCalendar";
import { BusinessListSheet } from "./BusinessListSheet";
import styles from "./css/Business.module.css";
import calendarStyles from "../calendar/css/CalendarPage.module.css";
// The Goals overview's tiles and cards, so the same thing has the same look.
import goalStyles from "../budget/components/css/GoalsWorkbench.module.css";
import { answerOrLetGo } from "../../shared/utils/pendingRecords";
import { usePendingRecords } from "../../shared/hooks/usePendingRecords";

// «Δουλειά» (item #71): a user's businesses, one «κλείσιμο ημέρας» at a time.
//
// The owner's words: «Τζίρος τόσο, έξοδα τόσο, κέρδος τόσο. Και το κέρδος να
// προστίθεται στα ήδη λεφτά μου.» A user has 0..n businesses, each with its own
// income and expense lines, all made by the user (DECISIONS: Business). Each
// closing is one business's day; the month is their sum. The day's profit — or
// loss — goes into the owner's own money as one linked record, written with the
// closing (`ClosingWizard`). Nothing else of the business reaches the personal
// totals.
//
// Two pages under «Δουλειά» in the menu, as Πάγια has its own (DECISIONS,
// 2026-11-12): the main page, /business, and «Οι δουλειές μου»,
// /business/manage — the businesses themselves, their own page rather than a
// tab. The menu leads to each; neither page draws link tabs to the other, so
// the main page keeps its ONE tab row (a page never shows two).
//
// The anatomy of every page (CLAUDE.md): the «+» header (`AddHeader`) — a new
// closing here, a new business on «Οι δουλειές μου» — the one business picker
// under its title («Όλες οι δουλειές ▾», the owner's mockup A, kept in the
// address as `?business=`), the tabs straight under them with the open one in
// the address (`?tab=`), and whatever belongs to one tab — the month ‹ ›, the
// tiles — inside that tab. One month is shared by the tabs.
//
// Switched on per account in Settings (`useHasAccess("business")`); off, the
// page is not there and reads nothing. Its closings are read only when it is
// opened, once per device and then by what changed (`syncedList`); the
// businesses are on the user document (no read of their own).

const TABS_BASE = "business";
const TABS = ["overview", "days", "calendar"] as const;
type BusinessTab = (typeof TABS)[number];
const PAGE = 31;
const ALL = "all";

/** A business being made or changed, or about to be deleted — on either page. */
type BusinessOpen = { kind: "business"; business?: Business } | { kind: "deleteBusiness"; business: Business };

type Open = { kind: "closing"; entry?: BusinessEntry } | { kind: "view" | "delete"; entry: BusinessEntry } | BusinessOpen | null;

/** A figure of the overview opened into its closings: the month's days, or one expense line's. Under any closing opened from it. */
type Sheet = { kind: "days" } | { kind: "line"; key: string; name: string } | null;

/** Which of the two pages: the main one (`/business`) or «Οι δουλειές μου» (`/business/manage`). */
export type BusinessPageView = "main" | "manage";

export default function BusinessPage({ view = "main" }: { view?: BusinessPageView }) {
  const [params] = useSearchParams();
  const access = useAccessState("business");
  // Whether the page is on is a setting on the account: a read of it that
  // never answers keeps the skeleton only for a while (`usePageLoad`).
  const accessLoad = usePageLoad(access === "unknown");
  // «Οι δουλειές μου» was a tab of this page: an old link to it lands on its own page.
  if (view === "main" && params.get("tab") === "businesses") return <Navigate to="/business/manage" replace />;
  if (access === "off") return <NotFoundPage />;
  if (access === "unknown") return accessLoad === "waiting" ? <BusinessWaiting /> : <BusinessSkeleton />;
  return view === "manage" ? <ManageScreen /> : <BusinessScreen />;
}

function BusinessSkeleton() {
  return (
    <PageShell>
      <SkeletonPageHeader />
      <SkeletonStats count={3} />
      <SkeletonRows count={4} />
    </PageShell>
  );
}

/** Not known yet whether the page is on, past the skeleton's time: its title and a quiet line — no add, nothing claimed. */
function BusinessWaiting() {
  const { t } = useTranslation();
  return (
    <PageShell>
      <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("business.title")}</h1>
      <p className="small text-body-secondary mb-3">{t("business.subtitle")}</p>
      <PageWaiting />
    </PageShell>
  );
}

/** Which business the page shows — `?business=<id>`, absent (or no longer there) = all of them. Replaced, not pushed. */
function useBusinessFilter(businesses: readonly Business[]): [string | undefined, (id: string | undefined) => void] {
  const [params, setParams] = useSearchParams();
  const asked = params.get("business") ?? undefined;
  const id = asked && businesses.some((b) => b.id === asked) ? asked : undefined;
  const choose = useCallback(
    (next: string | undefined) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set("business", next);
          else p.delete("business");
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [id, choose];
}

function BusinessScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();
  const entriesQuery = useBusinessEntries();
  const { data } = entriesQuery;
  const entries = useMemo(() => data ?? [], [data]);
  const [businesses] = useBusinesses();
  // The businesses are saved as one list: while it has not come, a new one
  // would write over those already there — so no «new business» until it has.
  const businessesMissing = useWorkspaceMissing(BUSINESSES_KEY);
  // The skeleton for a few seconds at most, then the page — see `usePageLoad`.
  const load = usePageLoad(noAnswerYet(entriesQuery) || businessesMissing);
  const [filter, setFilter] = useBusinessFilter(businesses);
  const remove = useDeleteClosing();
  const deleteGuard = useOfflineGuard("delete");
  const [now] = useState(() => new Date());
  const [month, setMonth] = useState(() => monthStart(now));
  const [tab, setTab] = usePageTab(TABS, "overview", "business:tab");
  const [open, setOpen] = useState<Open>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const hasBusiness = businesses.length > 0;
  const addClosing = () => setOpen({ kind: "closing" });
  const addBusiness = () => setOpen({ kind: "business" });
  const add = hasBusiness ? addClosing : addBusiness;
  const addLabel = t(hasBusiness ? "business.closingTitle" : "business.newBusiness");

  // The floating «+» does what the header's does.
  usePageAdd(addLabel, () => !businessesMissing && add());

  // Everything below shows the chosen business, or all of them.
  const shown = useMemo(() => forBusiness(entries, filter), [entries, filter]);
  const summary = useMemo(() => monthSummary(shown, month), [shown, month]);
  const rows = useMemo(() => monthEntries(shown, month), [shown, month]);
  const first = useMemo(() => new Date(shown.reduce((min, e) => Math.min(min, firestoreToDate(e.date).getTime()), now.getTime())), [shown, now]);
  const flashClass = useSavedFlash("businessEntries", useMemo(() => rows.map((r) => r.id), [rows]));
  const { limit, hasMore, sentinel } = useLoadMore(rows.length, PAGE, `${month.getTime()}:${tab}:${filter ?? ALL}`);
  const dayFormat = useMemo(() => dateFormat("weekdayShort", lang), [lang]);
  // On a row, which business it is — only when the page shows more than one.
  const many = !filter && businesses.length > 1;
  const nameOf = (entry: BusinessEntry) => businessOf(businesses, entry.businessId)?.name ?? t("business.unknownBusiness");

  const close = () => setOpen(null);
  const askDelete = (entry: BusinessEntry) => setOpen({ kind: "delete", entry });
  const edit = (entry: BusinessEntry) => setOpen({ kind: "closing", entry });
  // Both wait for the server's answer, 7 s at most (`answerOrLetGo`); the
  // dialog stays up, locked, until then — past 7 s it lets go, the closing
  // stays disabled and the toast comes with the answer. A second press is
  // never a second batch.
  const pending = usePendingRecords();
  const confirmDelete = (entry: BusinessEntry) =>
    answerOrLetGo(() => remove.mutateAsync(entry), {
      records: [["businessEntries", entry.id]],
      close,
      succeeded: () => toast.success(t("business.deleted")),
      failed: () => toast.error(t("business.deleteFailed")),
    });

  const tabs: { id: BusinessTab; label: string }[] = [
    { id: "overview", label: t("business.tabOverview") },
    { id: "days", label: t("business.tabDays") },
    { id: "calendar", label: t("business.tabCalendar") },
  ];
  // Never a "didn't load" message: the query retries on its own. The skeleton
  // for a few seconds; then, still nothing, a quiet line in every tab (`PageWaiting`).
  const loading = load === "loading";
  const waiting = load === "waiting";
  const empty = load === "ready" && shown.length === 0;
  const chosen = businessOf(businesses, filter);

  /** An invitation, with the page's add — what a page with nothing yet shows. No business yet: make one here, or go to where they are kept. */
  const invite = !hasBusiness ? (
    <FirstBusinessInvite onAdd={addBusiness} manageLink />
  ) : (
    <div className="text-center py-5 text-body-secondary">
      <p className="fs-1 mb-2" aria-hidden>
        🏪
      </p>
      <p className="fw-medium text-body-emphasis">{chosen ? t("business.emptyTitleOne", { name: chosen.name }) : t("business.emptyTitle")}</p>
      <p className="small">{t("business.emptyBody")}</p>
      <Button color="primary" onClick={addClosing}>
        + {t("business.addFirst")}
      </Button>
    </div>
  );

  const monthNav = <MonthNav month={month} onChange={setMonth} first={first} now={now} />;
  const panel = (which: BusinessTab, body: ReactNode) => {
    const ids = pageTabIds(TABS_BASE, which);
    return (
      <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} tabIndex={0} className={styles.panel}>
        {body}
      </div>
    );
  };
  const picks = useMemo(() => [{ id: ALL, label: t("business.allBusinesses") }, ...businesses.map((b) => ({ id: b.id, label: b.name }))], [businesses, t]);

  return (
    <PageShell>
      <AddHeader label={addLabel} onAdd={add} disabled={businessesMissing} title={t("business.title")} subtitle={t("business.subtitle")} className={businesses.length > 1 ? "mb-2" : "mb-3"} />
      {/* One business or all of them, for every tab: the owner's mockup A. Only once there is a choice to make. */}
      {businesses.length > 1 && (
        <div className="mb-3">
          <GoalPickMenu label={t("business.pickerLabel")} value={filter ?? ALL} options={picks} onChange={(id) => setFilter(id === ALL ? undefined : id)} icon={FiBriefcase} />
        </div>
      )}
      <PageTabs base={TABS_BASE} label={t("business.title")} tabs={tabs} value={tab} onChange={setTab} />

      {tab === "overview" &&
        panel(
          "overview",
          loading ? (
            <>
              <SkeletonStats count={3} />
              <SkeletonRows count={4} />
            </>
          ) : waiting ? (
            <PageWaiting />
          ) : empty ? (
            invite
          ) : (
            <>
              {monthNav}
              {/* What the figures are, and how they are made behind the ⓘ — the calendars' scope line. */}
              <div className={`${calendarStyles.scopeRow} mb-3`}>
                <p className={calendarStyles.scope}>{chosen ? t("business.overviewScopeOne", { name: chosen.name }) : t("business.overviewScope")}</p>
                <InfoLegend title={t("business.legendTitle")} label={t("business.legendTitle")}>
                  <p>{t("business.legendTurnover")}</p>
                  <p>{t("business.legendProfit")}</p>
                  <p className="mb-0">{t("business.legendMoney")}</p>
                </InfoLegend>
              </div>
              <MonthTiles summary={summary} lossDays={lossDays(rows)} formatCurrency={formatCurrency} onOpenDays={() => setSheet({ kind: "days" })} />
              <ExpensesByLine entries={shown} month={month} businesses={businesses} many={many} formatCurrency={formatCurrency} hasAny={summary.days > 0} onOpenLine={(key, name) => setSheet({ kind: "line", key, name })} />
            </>
          ),
        )}

      {tab === "days" &&
        panel(
          "days",
          loading ? (
            <SkeletonRows count={6} />
          ) : waiting ? (
            <PageWaiting />
          ) : empty ? (
            invite
          ) : (
            <>
              {monthNav}
              {rows.length === 0 ? (
                <p className="small text-body-secondary mb-0">{t("business.monthEmpty")}</p>
              ) : (
                // Phones: one list in a card, as before. From `md` the days stop
                // stretching edge to edge: compact cards in a grid, the way the
                // payees are laid out (`.days` / `.dayGrid`).
                <div className={`${styles.card} ${styles.days}`}>
                  <ul className={`${styles.rows} ${styles.dayGrid}`}>
                    {rows.slice(0, limit).map((entry) => {
                      const at = firestoreToDate(entry.date);
                      const f = closingFigures(entry);
                      const label = [many ? nameOf(entry) : "", t("business.dayLabel", { day: at.getDate(), weekday: dayFormat.format(at) })].filter(Boolean).join(" · ");
                      return (
                        <li key={entry.id} className={`${styles.row} ${flashClass(entry.id)}`}>
                          <button type="button" className={styles.rowMain} onClick={() => setOpen({ kind: "view", entry })} aria-label={`${label}: ${t(f.profit < 0 ? "business.loss" : "business.profit")} ${signed(f.profit, formatCurrency)}`}>
                            <span className={styles.rowDay} aria-hidden>
                              <strong>{at.getDate()}</strong>
                              {dayFormat.format(at)}
                            </span>
                            <span className={styles.rowText}>
                              {many && <span className={styles.rowBusiness}>{nameOf(entry)}</span>}
                              <span className={styles.rowMeta}>
                                {t("business.turnover")} <span className={styles.rowFigure}>{formatCurrency(f.turnover)}</span>
                              </span>
                              <span className={styles.rowMeta}>
                                {t("business.expenses")} <span className={styles.rowFigure}>{formatCurrency(f.expenses)}</span>
                              </span>
                            </span>
                            <span className={`${styles.rowAmount} ${profitTone(f.profit, styles)}`}>{signed(f.profit, formatCurrency)}</span>
                          </button>
                          <RowMenu
                            label={t("business.rowActions", { name: label })}
                            entries={[
                              { label: t("business.view"), icon: <FiEye size={14} aria-hidden />, onSelect: () => setOpen({ kind: "view", entry }) },
                              { label: t("common.edit"), icon: <FiEdit2 size={14} aria-hidden />, onSelect: () => edit(entry) },
                              { label: t("common.delete"), icon: <FiTrash2 size={14} aria-hidden />, danger: true, disabled: deleteGuard.locked, onSelect: () => askDelete(entry) },
                            ]}
                          />
                        </li>
                      );
                    })}
                  </ul>
                  {hasMore && <div ref={sentinel} aria-hidden />}
                </div>
              )}
            </>
          ),
        )}

      {tab === "calendar" &&
        panel(
          "calendar",
          loading ? (
            <SkeletonRows count={6} />
          ) : waiting ? (
            <PageWaiting />
          ) : !hasBusiness ? (
            invite
          ) : (
            <BusinessCalendar
              entries={shown}
              month={month}
              onMonthChange={setMonth}
              first={first}
              now={now}
              onOpen={(entry) => setOpen({ kind: "view", entry })}
              formatCurrency={formatCurrency}
              businessName={many ? nameOf : undefined}
            />
          ),
        )}

      {sheet && (
        <OverviewSheet
          sheet={sheet}
          rows={rows}
          shown={shown}
          month={month}
          profit={summary.profit}
          businessName={many ? nameOf : undefined}
          formatCurrency={formatCurrency}
          onOpen={(entry) => setOpen({ kind: "view", entry })}
          onClose={() => setSheet(null)}
        />
      )}
      {open?.kind === "closing" && <ClosingWizard entry={open.entry} businesses={businesses} preset={filter} onClose={close} onDelete={open.entry ? () => askDelete(open.entry!) : undefined} />}
      {open?.kind === "view" && <BusinessEntryView entry={open.entry} businesses={businesses} formatCurrency={formatCurrency} onClose={close} onEdit={() => edit(open.entry)} onDelete={() => askDelete(open.entry)} />}
      {open?.kind === "delete" && <BusinessDeleteModal entry={open.entry} businessName={nameOf(open.entry)} formatCurrency={formatCurrency} busy={pending.busy("businessEntries", open.entry.id)} onConfirm={() => confirmDelete(open.entry)} onClose={close} />}
      <BusinessDialogs
        open={open?.kind === "business" || open?.kind === "deleteBusiness" ? open : null}
        onChange={setOpen}
        entries={entries}
        entriesLoaded={!!data}
        onDeleted={(id) => {
          if (filter === id) setFilter(undefined);
        }}
      />
    </PageShell>
  );
}

/**
 * «Οι δουλειές μου», /business/manage: the businesses' cards, and the page's
 * «+» for a new one. With none yet, the invitation to make the first.
 * The closings are read only for the counts on the cards and what a delete
 * takes with it — the same synced list the main page reads, no read of its own.
 */
function ManageScreen() {
  const { t } = useTranslation();
  const entriesQuery = useBusinessEntries();
  const { data } = entriesQuery;
  const entries = useMemo(() => data ?? [], [data]);
  const [businesses] = useBusinesses();
  // As on the main page: no new business before the list has come — it would write over it.
  const businessesMissing = useWorkspaceMissing(BUSINESSES_KEY);
  // The skeleton for a few seconds at most, then the page — see `usePageLoad`.
  const load = usePageLoad(noAnswerYet(entriesQuery) || businessesMissing);
  const settingsGuard = useOfflineGuard("settings");
  const [open, setOpen] = useState<BusinessOpen | null>(null);
  const full = businesses.length >= BUSINESSES_MAX;
  const label = t("business.newBusiness");
  const add = () => {
    if (!full && !businessesMissing) setOpen({ kind: "business" });
  };

  // The floating «+» does what the header's does.
  usePageAdd(label, add);

  return (
    <PageShell>
      <AddHeader label={label} onAdd={add} disabled={full || settingsGuard.locked || businessesMissing} title={t("business.tabBusinesses")} subtitle={t("business.manageSubtitle")} />
      {load === "loading" ? (
        <SkeletonRows count={3} />
      ) : load === "waiting" ? (
        <PageWaiting />
      ) : (
        <BusinessesTab businesses={businesses} entries={entries} onAdd={add} onEdit={(business) => setOpen({ kind: "business", business })} onDelete={(business) => setOpen({ kind: "deleteBusiness", business })} />
      )}
      <BusinessDialogs open={open} onChange={setOpen} entries={entries} entriesLoaded={!!data} />
    </PageShell>
  );
}

/**
 * A business's form and its delete, the same on both pages. The delete waits
 * for the server's answer, 7 s at most (`answerOrLetGo`, run once —
 * `useDeleteBusiness`); the dialog stays up, locked, until then, and says how
 * it went in a toast.
 */
function BusinessDialogs({
  open,
  onChange,
  entries,
  entriesLoaded,
  onDeleted,
}: {
  open: BusinessOpen | null;
  onChange: (next: BusinessOpen | null) => void;
  entries: readonly BusinessEntry[];
  entriesLoaded: boolean;
  /** After a business is gone — the main page lets go of it in its picker. */
  onDeleted?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrencyConverter();
  const removeBusiness = useDeleteBusiness();
  const pending = usePendingRecords();
  const close = () => onChange(null);
  const confirmDelete = (business: Business) =>
    answerOrLetGo(() => removeBusiness.mutateAsync(business.id), {
      records: [["businesses", business.id], ...entries.filter((e) => e.businessId === business.id).map((e) => ["businessEntries", e.id] as const)],
      close,
      succeeded: (done) => {
        toast.success(t("business.businessDeleted", { name: business.name, count: done.businessEntries.length }));
        onDeleted?.(business.id);
      },
      failed: () => toast.error(t("business.deleteFailed")),
    });

  if (open?.kind === "business")
    return <BusinessWizard business={open.business} entries={entries} entriesLoaded={entriesLoaded} onClose={close} onDelete={open.business ? () => onChange({ kind: "deleteBusiness", business: open.business! }) : undefined} />;
  if (open?.kind === "deleteBusiness")
    return <DeleteBusinessModal business={open.business} entries={entries} busy={pending.busy("businesses", open.business.id)} formatCurrency={formatCurrency} onConfirm={() => confirmDelete(open.business)} onClose={close} />;
  return null;
}

const EDGE = { income: "var(--color-income)", expense: "var(--color-expense)" } as const;

/** The month's figures — turnover, expenses, profit, and how many days — as the Goals overview draws its tiles: label and sign, figure, a line under it, a tone edge. «Μέρες» opens into the month's days. */
function MonthTiles({ summary, lossDays, formatCurrency, onOpenDays }: { summary: BusinessMonth; lossDays: number; formatCurrency: (n: number) => string; onOpenDays: () => void }) {
  const { t } = useTranslation();
  const loss = Math.round(summary.profit * 100) < 0;
  const share = summary.turnover > 0 ? Math.round((summary.expenses / summary.turnover) * 100) : null;
  const perDay = summary.days > 0 ? Math.round((summary.turnover / summary.days) * 100) / 100 : null;
  const body = (label: ReactNode, icon: ReactNode, figure: string, sub: ReactNode, figureClass = "") => (
    <>
      <span className={goalStyles.overviewTileHead}>
        <span className={goalStyles.overviewTileLabel}>{label}</span>
        {icon}
      </span>
      <span className={`${goalStyles.overviewFigure} ${figureClass}`}>{figure}</span>
      <span className={goalStyles.overviewTileSub}>{sub}</span>
    </>
  );
  const tile = (label: ReactNode, icon: ReactNode, figure: string, sub: string, edge: string, figureClass = "") => (
    <div className={goalStyles.overviewTile} style={{ "--edge": edge } as CSSProperties}>
      {body(label, icon, figure, sub, figureClass)}
    </div>
  );
  const hasDays = summary.days > 0;
  return (
    <div className={goalStyles.overviewTiles}>
      {tile(t("business.turnover"), <span aria-hidden>💶</span>, formatCurrency(summary.turnover), perDay === null ? "—" : t("business.turnoverPerDay", { amount: formatCurrency(perDay) }), EDGE.income)}
      {tile(t("business.expenses"), <span aria-hidden>🧾</span>, formatCurrency(summary.expenses), share === null ? "—" : t("business.expensesShare", { pct: share }), EDGE.expense)}
      {tile(
        t(loss ? "business.loss" : "business.profit"),
        <span aria-hidden>{loss ? "📉" : "📈"}</span>,
        signed(summary.profit, formatCurrency),
        t("business.profitSub"),
        loss ? EDGE.expense : EDGE.income,
        profitTone(summary.profit, styles),
      )}
      {/* The days open into their list: a button with the tile's own look. A month with none has nothing to open. */}
      {hasDays ? (
        <button
          type="button"
          className={`${goalStyles.overviewTile} ${styles.tileButton}`}
          style={{ "--edge": "var(--bs-primary)" } as CSSProperties}
          onClick={onOpenDays}
          aria-label={`${t("business.tabDays")}: ${summary.days}, ${t("business.lossDays", { count: lossDays })}. ${t("business.daysOpen")}`}
        >
          {body(
            t("business.tabDays"),
            <span aria-hidden>📅</span>,
            String(summary.days),
            <>
              {t("business.lossDays", { count: lossDays })}
              <FiChevronRight size={14} className={styles.opens} aria-hidden />
            </>,
          )}
        </button>
      ) : (
        tile(t("business.tabDays"), <span aria-hidden>📅</span>, String(summary.days), t("business.lossDays", { count: lossDays }), "var(--bs-primary)")
      )}
    </div>
  );
}

/** «Πού πήγαν τα έξοδα»: the month's expenses by expense line, as the Goals overview draws «Κοντά στον στόχο». Each line opens into the closings its amount comes from. */
function ExpensesByLine({
  entries,
  month,
  businesses,
  many,
  formatCurrency,
  hasAny,
  onOpenLine,
}: {
  entries: readonly BusinessEntry[];
  month: Date;
  businesses: readonly Business[];
  /** More than one business on show: each line says whose it is. */
  many: boolean;
  formatCurrency: (n: number) => string;
  hasAny: boolean;
  onOpenLine: (key: ExpenseLineTotal["key"], name: string) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => monthByExpenseLine(entries, month), [entries, month]);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <Card className={`w-100 ${goalStyles.overviewCard}`}>
      <CardBody>
        <h2 className="stat-head mb-3">{t("business.byLine")}</h2>
        {!hasAny ? (
          <p className="small text-body-secondary mb-0">{t("business.monthEmpty")}</p>
        ) : rows.length === 0 ? (
          <p className="small text-body-secondary mb-0">{t("business.noExpensesThisMonth")}</p>
        ) : (
          <ul className={goalStyles.nearList} style={{ "--near": "var(--expense-fill)" } as CSSProperties}>
            {rows.map((row) => {
              const pct = total > 0 ? (row.total / total) * 100 : 0;
              const business = businessOf(businesses, row.businessId);
              const own = row.lineId ? lineName(business, row.lineId, t("business.lineGone")) : `${row.name || t("business.oneOffTag")} · ${t("business.oneOffTag")}`;
              const name = many ? `${own} · ${business?.name ?? t("business.unknownBusiness")}` : own;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    className={styles.lineButton}
                    onClick={() => onOpenLine(row.key, name)}
                    aria-label={`${t("business.lineOpen", { name, amount: formatCurrency(row.total) })} (${Math.round(pct)}%, ${t("business.timesCount", { count: row.count })})`}
                  >
                    <span className={goalStyles.nearHead} aria-hidden>
                      <span className={goalStyles.nearName}>{name}</span>
                      <span className={goalStyles.nearPct}>{Math.round(pct)}%</span>
                    </span>
                    <span className={`${goalStyles.nearTrack} d-block`} aria-hidden>
                      <span className={goalStyles.nearFill} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={`${goalStyles.nearMoney} d-block`} aria-hidden>
                      {formatCurrency(row.total)} · {t("business.timesCount", { count: row.count })}
                      <FiChevronRight size={13} className={styles.opens} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * A figure of the overview opened: «Μέρες» lists the month's closings with
 * their profit or loss, adding up to the profit tile; a line of «Πού πήγαν τα
 * έξοδα» lists the closings that paid on it, adding up to the bar. Both from
 * the closings on the device — no read. A row opens the closing's own view.
 */
function OverviewSheet({
  sheet,
  rows,
  shown,
  month,
  profit,
  businessName,
  formatCurrency,
  onOpen,
  onClose,
}: {
  sheet: NonNullable<Sheet>;
  /** The month's closings on show, newest first. */
  rows: readonly BusinessEntry[];
  /** Every closing on show (one business, or all), for a line's. */
  shown: readonly BusinessEntry[];
  month: Date;
  /** The month's profit: the «Μέρες» list's sum. */
  profit: number;
  businessName?: (entry: BusinessEntry) => string;
  formatCurrency: (n: number) => string;
  onOpen: (entry: BusinessEntry) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const period = dateFormat("monthYear", i18n.resolvedLanguage ?? "en").format(month);
  const lines = useMemo(() => (sheet.kind === "line" ? expenseLineClosings(shown, month, sheet.key) : []), [sheet, shown, month]);

  if (sheet.kind === "days") {
    const lost = lossDays(rows);
    return (
      <BusinessListSheet
        title={t("business.daysSheetTitle")}
        icon="📅"
        sub={`${t("business.closingsCount", { count: rows.length })} · ${period}${lost > 0 ? ` · ${t("business.lossDays", { count: lost })}` : ""}`}
        rows={rows.map((entry) => {
          const f = closingFigures(entry);
          return {
            entry,
            amount: f.profit,
            loss: Math.round(f.profit * 100) < 0,
            meta: (
              <>
                <span className={styles.rowMeta}>
                  {t("business.turnover")} <span className={styles.rowFigure}>{formatCurrency(f.turnover)}</span>
                </span>
                <span className={styles.rowMeta}>
                  {t("business.expenses")} <span className={styles.rowFigure}>{formatCurrency(f.expenses)}</span>
                </span>
              </>
            ),
          };
        })}
        total={profit}
        totalLabel={t(Math.round(profit * 100) < 0 ? "business.loss" : "business.profit")}
        signedFigures
        businessName={businessName}
        formatCurrency={formatCurrency}
        onOpen={onOpen}
        onClose={onClose}
      />
    );
  }
  // Added in cents from the very closings listed: the bar's figure (`expenseLineClosings`).
  const total = lines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0) / 100;
  return (
    <BusinessListSheet
      title={sheet.name}
      icon="🧾"
      sub={
        <>
          {t("business.closingsCount", { count: lines.length })} · {period}
          <br />
          {t("business.lineSheetSub")}
        </>
      }
      rows={lines}
      total={total}
      totalLabel={t("common.total")}
      signedFigures={false}
      businessName={businessName}
      formatCurrency={formatCurrency}
      onOpen={onOpen}
      onClose={onClose}
    />
  );
}
