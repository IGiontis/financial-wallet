import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FiBriefcase, FiEdit2, FiEye, FiTrash2 } from "react-icons/fi";
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
import { firestoreToDate } from "../../shared/utils/dates";
import { NotFoundPage } from "../errors/NotFoundPage";
import { GoalPickMenu } from "../budget/components/GoalPickMenu";
import type { Business, BusinessEntry } from "../../shared/types/IndexTypes";
import { closingFigures, forBusiness, monthByExpenseLine, monthEntries, monthStart, monthSummary, type BusinessMonth } from "./businessSummary";
import { businessOf, lineName, profitTone, signed } from "./businessFormat";
import { MonthNav } from "./businessShared";
import { useBusinessEntries, useBusinesses, useDeleteBusiness, useDeleteClosing } from "./useBusiness";
import ClosingWizard from "./ClosingWizard";
import BusinessWizard from "./BusinessWizard";
import { BusinessDeleteModal, BusinessEntryView } from "./BusinessEntryView";
import { BusinessesTab, DeleteBusinessModal, FirstBusinessInvite } from "./BusinessesTab";
import { BusinessCalendar } from "./BusinessCalendar";
import styles from "./css/Business.module.css";
import calendarStyles from "../calendar/css/CalendarPage.module.css";
// The Goals overview's tiles and cards, so the same thing has the same look.
import goalStyles from "../budget/components/css/GoalsWorkbench.module.css";

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
// The anatomy of every page (CLAUDE.md): the «+» header (`AddHeader`), the one
// business picker under its title («Όλες οι δουλειές ▾», the owner's mockup A,
// kept in the address as `?business=`), the tabs straight under them with the
// open one in the address (`?tab=`), and whatever belongs to one tab — the
// month ‹ ›, the tiles — inside that tab. One month is shared by the tabs.
//
// Switched on per account in Settings (`useHasAccess("business")`); off, the
// page is not there and reads nothing. Its closings are read only when it is
// opened, once per device and then by what changed (`syncedList`); the
// businesses are on the user document (no read of their own).

const TABS_BASE = "business";
const TABS = ["overview", "days", "calendar", "businesses"] as const;
type BusinessTab = (typeof TABS)[number];
const PAGE = 31;
const ALL = "all";

type Open =
  | { kind: "closing"; entry?: BusinessEntry }
  | { kind: "view" | "delete"; entry: BusinessEntry }
  | { kind: "business"; business?: Business }
  | { kind: "deleteBusiness"; business: Business }
  | null;

export default function BusinessPage() {
  const access = useAccessState("business");
  if (access === "off") return <NotFoundPage />;
  if (access === "unknown") return <BusinessSkeleton />;
  return <BusinessScreen />;
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
  const { data, isLoading, isError } = useBusinessEntries();
  const entries = useMemo(() => data ?? [], [data]);
  const [businesses] = useBusinesses();
  const [filter, setFilter] = useBusinessFilter(businesses);
  const remove = useDeleteClosing();
  const removeBusiness = useDeleteBusiness();
  const deleteGuard = useOfflineGuard("delete");
  const [now] = useState(() => new Date());
  const [month, setMonth] = useState(() => monthStart(now));
  const [tab, setTab] = usePageTab(TABS, "overview", "business:tab");
  const [open, setOpen] = useState<Open>(null);
  const hasBusiness = businesses.length > 0;
  const addClosing = () => setOpen({ kind: "closing" });
  const addBusiness = () => setOpen({ kind: "business" });
  const add = hasBusiness ? addClosing : addBusiness;
  const addLabel = t(hasBusiness ? "business.closingTitle" : "business.newBusiness");

  // The floating «+» does what the header's does.
  usePageAdd(addLabel, add);

  // Everything below shows the chosen business, or all of them.
  const shown = useMemo(() => forBusiness(entries, filter), [entries, filter]);
  const summary = useMemo(() => monthSummary(shown, month), [shown, month]);
  const rows = useMemo(() => monthEntries(shown, month), [shown, month]);
  const first = useMemo(() => new Date(shown.reduce((min, e) => Math.min(min, firestoreToDate(e.date).getTime()), now.getTime())), [shown, now]);
  const flashClass = useSavedFlash("businessEntries", useMemo(() => rows.map((r) => r.id), [rows]));
  const { limit, hasMore, sentinel } = useLoadMore(rows.length, PAGE, `${month.getTime()}:${tab}:${filter ?? ALL}`);
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "short" }), [lang]);
  // On a row, which business it is — only when the page shows more than one.
  const many = !filter && businesses.length > 1;
  const nameOf = (entry: BusinessEntry) => businessOf(businesses, entry.businessId)?.name ?? t("business.unknownBusiness");

  const close = () => setOpen(null);
  const askDelete = (entry: BusinessEntry) => setOpen({ kind: "delete", entry });
  const edit = (entry: BusinessEntry) => setOpen({ kind: "closing", entry });
  const confirmDelete = (entry: BusinessEntry) =>
    remove.mutate(entry, {
      onSuccess: () => {
        toast.success(t("business.deleted"));
        close();
      },
      onError: () => toast.error(t("business.deleteFailed")),
    });
  const confirmDeleteBusiness = (business: Business) =>
    removeBusiness.mutate(business.id, {
      onSuccess: (done) => {
        toast.success(t("business.businessDeleted", { name: business.name, count: done.businessEntries.length }));
        if (filter === business.id) setFilter(undefined);
        close();
      },
      onError: () => toast.error(t("business.deleteFailed")),
    });

  const tabs: { id: BusinessTab; label: string }[] = [
    { id: "overview", label: t("business.tabOverview") },
    { id: "days", label: t("business.tabDays") },
    { id: "calendar", label: t("business.tabCalendar") },
    { id: "businesses", label: t("business.tabBusinesses") },
  ];
  // Never a "didn't load" message: the query retries on its own, and the skeleton stays until it is in.
  const loading = isLoading || (isError && !data);
  const empty = !loading && shown.length === 0;
  const chosen = businessOf(businesses, filter);

  /** An invitation, with the page's add — what a page with nothing yet shows. */
  const invite = !hasBusiness ? (
    <FirstBusinessInvite onAdd={addBusiness} />
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
      <AddHeader label={addLabel} onAdd={add} title={t("business.title")} subtitle={t("business.subtitle")} className={businesses.length > 1 ? "mb-2" : "mb-3"} />
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
              <MonthTiles summary={summary} lossDays={rows.filter((e) => Math.round(closingFigures(e).profit * 100) < 0).length} formatCurrency={formatCurrency} />
              <ExpensesByLine entries={shown} month={month} businesses={businesses} many={many} formatCurrency={formatCurrency} hasAny={summary.days > 0} />
            </>
          ),
        )}

      {tab === "days" &&
        panel(
          "days",
          loading ? (
            <SkeletonRows count={6} />
          ) : empty ? (
            invite
          ) : (
            <>
              {monthNav}
              {rows.length === 0 ? (
                <p className="small text-body-secondary mb-0">{t("business.monthEmpty")}</p>
              ) : (
                <div className={`${styles.card} p-3 p-lg-4`}>
                  <ul className={styles.rows}>
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

      {tab === "businesses" &&
        panel(
          "businesses",
          loading ? (
            <SkeletonRows count={3} />
          ) : (
            <BusinessesTab businesses={businesses} entries={entries} onAdd={addBusiness} onEdit={(business) => setOpen({ kind: "business", business })} onDelete={(business) => setOpen({ kind: "deleteBusiness", business })} />
          ),
        )}

      {open?.kind === "closing" && <ClosingWizard entry={open.entry} businesses={businesses} preset={filter} onClose={close} onDelete={open.entry ? () => askDelete(open.entry!) : undefined} />}
      {open?.kind === "view" && <BusinessEntryView entry={open.entry} businesses={businesses} formatCurrency={formatCurrency} onClose={close} onEdit={() => edit(open.entry)} onDelete={() => askDelete(open.entry)} />}
      {open?.kind === "delete" && <BusinessDeleteModal entry={open.entry} businessName={nameOf(open.entry)} formatCurrency={formatCurrency} busy={remove.isPending} onConfirm={() => confirmDelete(open.entry)} onClose={close} />}
      {open?.kind === "business" && (
        <BusinessWizard business={open.business} entries={entries} entriesLoaded={!!data} onClose={close} onDelete={open.business ? () => setOpen({ kind: "deleteBusiness", business: open.business! }) : undefined} />
      )}
      {open?.kind === "deleteBusiness" && (
        <DeleteBusinessModal business={open.business} entries={entries} busy={removeBusiness.isPending} formatCurrency={formatCurrency} onConfirm={() => confirmDeleteBusiness(open.business)} onClose={close} />
      )}
    </PageShell>
  );
}

const EDGE = { income: "var(--color-income)", expense: "var(--color-expense)" } as const;

/** The month's figures — turnover, expenses, profit, and how many days — as the Goals overview draws its tiles: label and sign, figure, a line under it, a tone edge. */
function MonthTiles({ summary, lossDays, formatCurrency }: { summary: BusinessMonth; lossDays: number; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const loss = Math.round(summary.profit * 100) < 0;
  const share = summary.turnover > 0 ? Math.round((summary.expenses / summary.turnover) * 100) : null;
  const perDay = summary.days > 0 ? Math.round((summary.turnover / summary.days) * 100) / 100 : null;
  const tile = (label: ReactNode, icon: ReactNode, figure: string, sub: string, edge: string, figureClass = "") => (
    <div className={goalStyles.overviewTile} style={{ "--edge": edge } as CSSProperties}>
      <div className={goalStyles.overviewTileHead}>
        <p className={goalStyles.overviewTileLabel}>{label}</p>
        {icon}
      </div>
      <p className={`${goalStyles.overviewFigure} ${figureClass}`}>{figure}</p>
      <p className={goalStyles.overviewTileSub}>{sub}</p>
    </div>
  );
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
      {tile(t("business.tabDays"), <span aria-hidden>📅</span>, String(summary.days), t("business.lossDays", { count: lossDays }), "var(--bs-primary)")}
    </div>
  );
}

/** «Πού πήγαν τα έξοδα»: the month's expenses by expense line, as the Goals overview draws «Κοντά στον στόχο». */
function ExpensesByLine({
  entries,
  month,
  businesses,
  many,
  formatCurrency,
  hasAny,
}: {
  entries: readonly BusinessEntry[];
  month: Date;
  businesses: readonly Business[];
  /** More than one business on show: each line says whose it is. */
  many: boolean;
  formatCurrency: (n: number) => string;
  hasAny: boolean;
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
                  <div className={goalStyles.nearHead}>
                    <span className={goalStyles.nearName}>{name}</span>
                    <span className={goalStyles.nearPct}>{Math.round(pct)}%</span>
                  </div>
                  <div className={goalStyles.nearTrack} role="progressbar" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                    <span className={goalStyles.nearFill} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={goalStyles.nearMoney}>
                    {formatCurrency(row.total)} · {t("business.timesCount", { count: row.count })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
