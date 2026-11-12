import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FiEdit2, FiEye, FiTrash2 } from "react-icons/fi";
import { PageShell } from "../../shared/components/PageShell";
import { AddHeader } from "../../shared/components/AddButton";
import { UnderlineTabs } from "../../shared/components/UnderlineTabs";
import { RowMenu } from "../../shared/components/RowMenu";
import { InfoLegend } from "../../shared/components/InfoLegend";
import { SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../../shared/components/Skeletons";
import { useSavedFlash } from "../../shared/feedback/saveFeedback";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLoadMore } from "../../shared/hooks/useLoadMore";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { useAccessState } from "../../shared/hooks/useHasAccess";
import { underlineTabIds } from "../../shared/utils/underlineTabIds";
import { firestoreToDate } from "../../shared/utils/dates";
import { NotFoundPage } from "../errors/NotFoundPage";
import type { BusinessCategory, BusinessEntry } from "../../shared/types/IndexTypes";
import { closingFigures, monthByCategory, monthEntries, monthStart, monthSummary, type BusinessMonth } from "./businessSummary";
import { categoryName, profitTone, signed } from "./businessFormat";
import { MonthNav } from "./businessShared";
import { useBusinessCategories, useBusinessEntries, useDeleteClosing } from "./useBusiness";
import { useBusinessTab, type BusinessTab } from "./useBusinessTab";
import ClosingWizard from "./ClosingWizard";
import { BusinessDeleteModal, BusinessEntryView } from "./BusinessEntryView";
import { BusinessCategories } from "./BusinessCategories";
import { BusinessCalendar } from "./BusinessCalendar";
import styles from "./css/Business.module.css";
import calendarStyles from "../calendar/css/CalendarPage.module.css";
// The Goals overview's tiles and cards, so the same thing has the same look.
import goalStyles from "../budget/components/css/GoalsWorkbench.module.css";

// «Δουλειά» (item #71): a small business, one «κλείσιμο ημέρας» at a time.
//
// The owner's words: «Τζίρος τόσο, έξοδα τόσο, κέρδος τόσο. Και το κέρδος να
// προστίθεται στα ήδη λεφτά μου.» Each closing is the day's turnover and its
// expense lines; the month is their sum. The day's profit — or loss — goes into
// the owner's own money as one linked record, written with the closing
// (`ClosingWizard`). Nothing else of the business reaches the personal totals.
//
// The anatomy of every page (CLAUDE.md): the «+» header (`AddHeader`), the tabs
// straight under it with the open one in the address (`useBusinessTab`), and
// whatever belongs to one tab — the month ‹ ›, the tiles — inside that tab. One
// month is shared by the tabs that show one.
//
// Switched on per account in Settings (`useHasAccess("business")`); off, the
// page is not there and reads nothing. Its closings are read only when it is
// opened, once per device and then by what changed (`syncedList`).

const TABS_BASE = "business";
const PAGE = 31;

type Open = { kind: "closing"; entry?: BusinessEntry } | { kind: "view" | "delete"; entry: BusinessEntry } | null;

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

function BusinessScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();
  const { data, isLoading, isError } = useBusinessEntries();
  const entries = useMemo(() => data ?? [], [data]);
  const [categories] = useBusinessCategories();
  const remove = useDeleteClosing();
  const deleteGuard = useOfflineGuard("delete");
  const [now] = useState(() => new Date());
  const [month, setMonth] = useState(() => monthStart(now));
  const [tab, setTab] = useBusinessTab();
  const [open, setOpen] = useState<Open>(null);
  const add = () => setOpen({ kind: "closing" });

  // The floating «+» closes a day here, as the header's does.
  usePageAdd(t("business.closingTitle"), add);

  const summary = useMemo(() => monthSummary(entries, month), [entries, month]);
  const rows = useMemo(() => monthEntries(entries, month), [entries, month]);
  const first = useMemo(() => new Date(entries.reduce((min, e) => Math.min(min, firestoreToDate(e.date).getTime()), now.getTime())), [entries, now]);
  const flashClass = useSavedFlash("businessEntries", useMemo(() => rows.map((r) => r.id), [rows]));
  const { limit, hasMore, sentinel } = useLoadMore(rows.length, PAGE, `${month.getTime()}:${tab}`);
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "short" }), [lang]);

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

  const tabs: { id: BusinessTab; label: string }[] = [
    { id: "overview", label: t("business.tabOverview") },
    { id: "days", label: t("business.tabDays") },
    { id: "calendar", label: t("business.tabCalendar") },
    { id: "categories", label: t("business.tabCategories") },
  ];
  // Never a "didn't load" message: the query retries on its own, and the skeleton stays until it is in.
  const loading = isLoading || (isError && !data);
  const empty = !loading && entries.length === 0;

  /** An invitation, with the page's add — what a page with nothing yet shows. */
  const invite = (
    <div className="text-center py-5 text-body-secondary">
      <p className="fs-1 mb-2" aria-hidden>
        🏪
      </p>
      <p className="fw-medium text-body-emphasis">{t("business.emptyTitle")}</p>
      <p className="small">{t("business.emptyBody")}</p>
      <Button color="primary" onClick={add}>
        + {t("business.addFirst")}
      </Button>
    </div>
  );

  const monthNav = <MonthNav month={month} onChange={setMonth} first={first} now={now} />;
  const panel = (which: BusinessTab, body: ReactNode) => {
    const ids = underlineTabIds(TABS_BASE, which);
    return (
      <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} tabIndex={0} className={styles.panel}>
        {body}
      </div>
    );
  };

  return (
    <PageShell>
      <AddHeader label={t("business.closingTitle")} onAdd={add} title={t("business.title")} subtitle={t("business.subtitle")} />
      <UnderlineTabs base={TABS_BASE} label={t("business.title")} tabs={tabs} value={tab} onChange={setTab} />

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
                <p className={calendarStyles.scope}>{t("business.overviewScope")}</p>
                <InfoLegend title={t("business.legendTitle")} label={t("business.legendTitle")}>
                  <p>{t("business.legendTurnover")}</p>
                  <p>{t("business.legendProfit")}</p>
                  <p className="mb-0">{t("business.legendMoney")}</p>
                </InfoLegend>
              </div>
              <MonthTiles summary={summary} lossDays={rows.filter((e) => Math.round(closingFigures(e).profit * 100) < 0).length} formatCurrency={formatCurrency} />
              <Overview entries={entries} month={month} categories={categories} formatCurrency={formatCurrency} hasAny={summary.days > 0} />
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
                      const label = t("business.dayLabel", { day: at.getDate(), weekday: dayFormat.format(at) });
                      return (
                        <li key={entry.id} className={`${styles.row} ${flashClass(entry.id)}`}>
                          <button type="button" className={styles.rowMain} onClick={() => setOpen({ kind: "view", entry })} aria-label={`${label}: ${t("business.profit")} ${signed(f.profit, formatCurrency)}`}>
                            <span className={styles.rowDay} aria-hidden>
                              <strong>{at.getDate()}</strong>
                              {dayFormat.format(at)}
                            </span>
                            <span className={styles.rowText}>
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
          ) : (
            <BusinessCalendar entries={entries} month={month} onMonthChange={setMonth} first={first} now={now} onOpen={(entry) => setOpen({ kind: "view", entry })} formatCurrency={formatCurrency} />
          ),
        )}

      {tab === "categories" && panel("categories", <BusinessCategories entries={entries} />)}

      {open?.kind === "closing" && <ClosingWizard entry={open.entry} onClose={close} onDelete={open.entry ? () => askDelete(open.entry!) : undefined} />}
      {open?.kind === "view" && <BusinessEntryView entry={open.entry} categories={categories} formatCurrency={formatCurrency} onClose={close} onEdit={() => edit(open.entry)} onDelete={() => askDelete(open.entry)} />}
      {open?.kind === "delete" && <BusinessDeleteModal entry={open.entry} formatCurrency={formatCurrency} busy={remove.isPending} onConfirm={() => confirmDelete(open.entry)} onClose={close} />}
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

/** «Πού πήγαν τα έξοδα»: the month's expenses by category, as the Goals overview draws «Κοντά στον στόχο». */
function Overview({ entries, month, categories, formatCurrency, hasAny }: { entries: readonly BusinessEntry[]; month: Date; categories: readonly BusinessCategory[]; formatCurrency: (n: number) => string; hasAny: boolean }) {
  const { t } = useTranslation();
  const known = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  const rows = useMemo(() => monthByCategory(entries, month, known), [entries, month, known]);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <Card className={`w-100 ${goalStyles.overviewCard}`}>
      <CardBody>
        <h2 className="stat-head mb-3">{t("business.byCategory")}</h2>
        {!hasAny ? (
          <p className="small text-body-secondary mb-0">{t("business.monthEmpty")}</p>
        ) : rows.length === 0 ? (
          <p className="small text-body-secondary mb-0">{t("business.noExpensesThisMonth")}</p>
        ) : (
          <ul className={goalStyles.nearList} style={{ "--near": "var(--expense-fill)" } as CSSProperties}>
            {rows.map((row) => {
              const pct = total > 0 ? (row.total / total) * 100 : 0;
              const name = categoryName(categories, row.categoryId, t("business.noCategory"));
              return (
                <li key={row.categoryId || "none"}>
                  <div className={goalStyles.nearHead}>
                    <span className={goalStyles.nearName}>{name}</span>
                    <span className={goalStyles.nearPct}>{Math.round(pct)}%</span>
                  </div>
                  <div className={goalStyles.nearTrack} role="progressbar" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                    <span className={goalStyles.nearFill} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={goalStyles.nearMoney}>
                    {formatCurrency(row.total)} · {t("business.linesCount", { count: row.count })}
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
