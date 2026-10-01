import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiChevronRight } from "react-icons/fi";
import { Sparkline } from "./Sparkline";
import type { AttentionItem } from "../overviewTabs";
import type { NetWorthPoint } from "../../analytics/netWorthUtils";
import { daysLate, type ResolvedOccurrence } from "../../plannerPage/plannerActuals";
import { SALARY_ROW_ID } from "../../plannerPage/plannerUtils";
import { UnconfirmedQuestion } from "../../plannerPage/components/UnconfirmedQuestion";
import type { Category, Transaction } from "../../../shared/types/IndexTypes";
import { categoryLabel } from "../../../shared/utils/categories";
import { firestoreToDate } from "../../../shared/utils/dates";
import { isPlainExpense } from "../overviewUtils";
import styles from "../pages/css/OverviewPage.module.css";

type Money = (n: number) => string;

/** A card with a small heading, the building block of every tab. */
export function Panel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="mb-0">
      <CardBody className="p-3">
        {(title || action) && (
          <div className="d-flex justify-content-between align-items-baseline mb-2 gap-2">
            {title && <span className={styles.panelTitle}>{title}</span>}
            {action}
          </div>
        )}
        {children}
      </CardBody>
    </Card>
  );
}

// ─── Today ──────────────────────────────────────────────────────────────────

/**
 * Only what wants doing, most urgent first — and done from here.
 *
 * Each row used to be a link to the Bills page, where the bill had to be found
 * again before it could be marked paid. Now the button is on the row: a bill
 * opens the same payment dialog the Bills page uses, and a salary or instalment
 * the Planner is waiting for is confirmed with the same word its own sheet
 * records. When nothing wants doing it says so in one line and gets out of the
 * way — on a quiet day there is nothing to read.
 *
 * Pay the plan could not confirm comes first: until it is answered the
 * pay-day outlook above leaves it out, so it is the one row that changes a
 * figure on this screen.
 */
export function AttentionList({
  items,
  late = [],
  unconfirmed = [],
  now,
  formatCurrency,
  onPay,
  onSettle,
  onAnswer,
}: {
  items: AttentionItem[];
  /** Planner occurrences overdue: a salary not in yet, an instalment not seen. */
  late?: ResolvedOccurrence[];
  /** Money in with no record that the last bank reading may already hold. */
  unconfirmed?: ResolvedOccurrence[];
  now: Date;
  formatCurrency: Money;
  onPay?: (billId: string) => void;
  onSettle?: (occurrence: ResolvedOccurrence) => void;
  /** "It came" (true) or "not yet" (false) to an unconfirmed one. */
  onAnswer?: (occurrence: ResolvedOccurrence, arrived: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" });
  const asked = onAnswer ? unconfirmed : [];

  if (items.length === 0 && late.length === 0 && asked.length === 0) {
    return (
      <Panel>
        <div className="d-flex align-items-center gap-2" style={{ color: "var(--color-income-text)" }}>
          <FiCheckCircle size={18} aria-hidden />
          <span className="fw-semibold">{t("overview.allClear")}</span>
        </div>
        <div className="small text-body-secondary mt-1">{t("overview.allClearHint")}</div>
      </Panel>
    );
  }

  const badge = (lateBy: number | undefined, days: number) =>
    lateBy !== undefined ? (
      <Badge pill color="danger-subtle" className="text-danger-emphasis">
        {t("overview.lateBy", { count: lateBy })}
      </Badge>
    ) : (
      <Badge pill color="warning-subtle" className="text-warning-emphasis">
        {days === 0 ? t("overview.dueToday") : t("overview.dueIn", { count: days })}
      </Badge>
    );

  return (
    <Panel title={t("overview.needsYou", { count: items.length + late.length + asked.length })}>
      <div className={styles.attention}>
        {asked.map((occurrence) => (
          <UnconfirmedQuestion
            key={occurrence.key}
            occurrence={occurrence}
            dateFmt={dateFmt}
            className={styles.attentionRow}
            textClassName={styles.attentionName}
            amount={<span className={styles.attentionAmount}>{formatCurrency(Math.abs(occurrence.amount))}</span>}
            onAnswer={(arrived) => onAnswer?.(occurrence, arrived)}
          />
        ))}
        {late.map((occurrence) => (
          <div key={occurrence.key} className={styles.attentionRow}>
            <Link to="/planner" className={styles.attentionName}>
              <span className="text-truncate">{occurrence.label === SALARY_ROW_ID ? t("planner.salaryLabel") : occurrence.label}</span>
              {badge(Math.max(1, daysLate(occurrence, now)), 0)}
            </Link>
            <span className={styles.attentionAmount}>{formatCurrency(Math.abs(occurrence.amount))}</span>
            {onSettle && (
              <Button size="sm" color="success" outline className="flex-shrink-0" onClick={() => onSettle(occurrence)}>
                {t(occurrence.amount > 0 ? "overview.itArrived" : "overview.markPaid")}
              </Button>
            )}
          </div>
        ))}
        {items.map((item) =>
          item.kind === "bill" && onPay ? (
            <div key={`${item.kind}-${item.id}`} className={styles.attentionRow}>
              <Link to="/bills" className={styles.attentionName}>
                <span className="text-truncate">{item.name}</span>
                {badge(item.late ? Math.abs(item.days) : undefined, item.days)}
              </Link>
              <span className={styles.attentionAmount}>{formatCurrency(item.amount)}</span>
              <Button size="sm" color="success" outline className="flex-shrink-0" onClick={() => onPay(item.id)}>
                {t("overview.markPaid")}
              </Button>
            </div>
          ) : (
            <Link key={`${item.kind}-${item.id}`} to={item.kind === "bill" ? "/bills" : "/debts"} className={styles.attentionRow}>
              <span className={styles.attentionName}>
                <span className="text-truncate">{item.name}</span>
                {badge(item.late ? Math.abs(item.days) : undefined, item.days)}
              </span>
              <span className={styles.attentionAmount}>{formatCurrency(item.amount)}</span>
              <FiChevronRight size={16} className="text-body-secondary flex-shrink-0" aria-hidden />
            </Link>
          ),
        )}
      </div>
    </Panel>
  );
}

// ─── What was written down today ────────────────────────────────────────────

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const newestFirst = (a: Transaction, b: Transaction) => firestoreToDate(b.createdAt ?? b.date).getTime() - firestoreToDate(a.createdAt ?? a.date).getTime();

/**
 * Today's records, so a forgotten coffee is noticed today rather than at the
 * next bank reading — and the last one from yesterday, so an empty morning
 * still shows where the writing stopped.
 */
export function TodayPanel({ transactions, categories, now, formatCurrency }: { transactions: Transaction[]; categories: Category[]; now: Date; formatCurrency: Money }) {
  const { t } = useTranslation();
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const today = transactions.filter((tx) => sameDay(firestoreToDate(tx.date), now)).sort(newestFirst);
  const yesterday = transactions.filter((tx) => sameDay(firestoreToDate(tx.date), yesterdayDate)).sort(newestFirst)[0];
  const spent = Math.round(today.filter(isPlainExpense).reduce((sum, tx) => sum + Math.abs(tx.amount), 0) * 100) / 100;

  const categoryOf = (tx: Transaction) => categories.find((c) => c.id === tx.categoryId);
  const nameOf = (tx: Transaction) => tx.description?.trim() || categoryLabel(categoryOf(tx)?.name, t) || "—";

  return (
    <Panel
      title={today.length > 0 ? t("overview.todayTitle", { count: today.length }) : t("overview.todayNone")}
      action={
        <span className="d-inline-flex align-items-baseline gap-2">
          {spent > 0 && (
            <span className="fw-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(spent)}
            </span>
          )}
          <Link to="/transactions" className="small text-decoration-none">
            {t("overview.allEntries")}
          </Link>
        </span>
      }
    >
      {today.length > 0 && (
        <ul className={styles.todayList}>
          {today.slice(0, 4).map((tx) => {
            const category = categoryOf(tx);
            const income = tx.type === "income";
            return (
              <li key={tx.id}>
                <span className={styles.todayIcon} aria-hidden>
                  {category?.icon ?? "•"}
                </span>
                <span className={styles.todayName}>
                  <span className="text-truncate fw-semibold">{nameOf(tx)}</span>
                  <span className="text-truncate small text-body-secondary">{categoryLabel(category?.name, t)}</span>
                </span>
                <span className={styles.attentionAmount} style={{ color: income ? "var(--color-income-text)" : undefined }}>
                  {income ? "+" : ""}
                  {formatCurrency(Math.abs(tx.amount))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {yesterday && <div className="small text-body-secondary text-truncate mt-1">{t("overview.yesterdayLast", { name: nameOf(yesterday), amount: formatCurrency(Math.abs(yesterday.amount)) })}</div>}
    </Panel>
  );
}

/** Two figures for the month so far — the whole month in one line. */
/**
 * `unlogged` is what the bank readings this month found gone (negative) or
 * arrived (positive) without a record — shown beside the figure it belongs to,
 * not folded into it, so the recorded total stays what was recorded.
 */
export function MonthInOut({ income, expenses, formatCurrency, sub, unlogged = 0 }: { income: number; expenses: number; formatCurrency: Money; sub?: string; unlogged?: number }) {
  const { t } = useTranslation();
  return (
    <div className={styles.pair}>
      <Panel title={t("overview.cameIn")}>
        <div className={styles.pairValue} style={{ color: "var(--color-income-text)" }}>
          {formatCurrency(income)}
        </div>
        {sub && <div className="small text-body-secondary">{sub}</div>}
        {unlogged > 0 && (
          <Link to="/accounts" className="small text-decoration-none d-block" style={{ color: "var(--color-income-text)" }}>
            {t("overview.unloggedIn", { amount: formatCurrency(unlogged) })}
          </Link>
        )}
      </Panel>
      <Panel title={t("overview.wentOut")}>
        <div className={styles.pairValue} style={{ color: "var(--color-expense-text)" }}>
          {formatCurrency(expenses)}
        </div>
        <div className="small text-body-secondary">{t("overview.soFarThisMonth")}</div>
        {unlogged < 0 && (
          <Link to="/accounts" className="small text-decoration-none d-block" style={{ color: "var(--color-expense-text)" }}>
            {t("overview.unloggedOut", { amount: formatCurrency(-unlogged) })}
          </Link>
        )}
      </Panel>
    </div>
  );
}

// ─── Position ───────────────────────────────────────────────────────────────

/**
 * What there is, less what is owed — the same series the Analytics page draws,
 * so the two can never show different figures for the same month.
 */
export function PositionPanel({ series, formatCurrency, locale }: { series: NetWorthPoint[]; formatCurrency: Money; locale: string }) {
  const { t } = useTranslation();
  const now = series[series.length - 1];
  if (!now) return <Panel>{t("overview.noPosition")}</Panel>;

  const before = series.length > 1 ? series[series.length - 2] : undefined;
  const change = before ? Math.round((now.net - before.net) * 100) / 100 : undefined;
  const monthName = before ? new Intl.DateTimeFormat(locale, { month: "long" }).format(before.start) : "";

  const rows: { label: string; value: number; color: string }[] = [
    { label: t("analytics.netWorth.cash"), value: now.cash, color: "var(--color-text-primary)" },
    { label: t("analytics.netWorth.saved"), value: now.saved, color: "var(--color-invest)" },
    ...(now.owedToMe > 0 ? [{ label: t("analytics.netWorth.owedToMe"), value: now.owedToMe, color: "var(--color-goal)" }] : []),
    ...(now.owedByMe > 0 ? [{ label: t("analytics.netWorth.owedByMe"), value: -now.owedByMe, color: "var(--color-expense-text)" }] : []),
  ];

  return (
    <>
      <Panel title={t("overview.netPosition")} action={<Link to="/analytics" className="small text-decoration-none">{t("overview.openAnalytics")}</Link>}>
        <div className={styles.verdictValue} style={{ color: now.net >= 0 ? "var(--color-text-primary)" : "var(--color-expense-text)" }}>
          {formatCurrency(now.net)}
        </div>
        {change !== undefined && (
          <div className="small" style={{ color: change >= 0 ? "var(--color-income-text)" : "var(--color-expense-text)" }}>
            {change >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(change))} {t("overview.sinceMonth", { month: monthName })}
          </div>
        )}
        {series.length > 1 && (
          <Sparkline className={styles.positionSpark} values={series.map((p) => p.net)} tone={now.net >= (series[0]?.net ?? 0) ? "var(--color-income)" : "var(--color-expense)"} label={t("overview.netPosition")} />
        )}
      </Panel>

      <Panel title={t("overview.madeOf")}>
        <dl className={styles.madeOf}>
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd style={{ color: row.color }}>{formatCurrency(row.value)}</dd>
            </div>
          ))}
          <div className={styles.madeOfTotal}>
            <dt>{t("overview.netPosition")}</dt>
            <dd>{formatCurrency(now.net)}</dd>
          </div>
        </dl>
      </Panel>
    </>
  );
}

// ─── Everything ─────────────────────────────────────────────────────────────

export interface OverviewTile {
  to: string;
  label: string;
  value: string;
  sub: string;
  tone?: string;
}

/** One tile per part of the app, each with the one figure that matters there. */
export function TileGrid({ tiles }: { tiles: OverviewTile[] }) {
  return (
    <div className={styles.tiles}>
      {tiles.map((tile) => (
        <Link key={tile.to} to={tile.to} className={styles.tile}>
          <span className={styles.tileLabel}>
            {tile.label}
            <FiChevronRight size={14} aria-hidden />
          </span>
          <span className={styles.tileValue} style={{ color: tile.tone }}>
            {tile.value}
          </span>
          <span className={styles.tileSub}>{tile.sub}</span>
        </Link>
      ))}
    </div>
  );
}

// ─── Where it went ──────────────────────────────────────────────────────────

const SPEND_COLOURS = ["var(--bs-primary)", "var(--color-income)", "var(--color-goal)", "var(--color-invest)"];

/**
 * The month's spending by category, as one bar and the few lines behind it —
 * adding up to exactly the "went out" figure, since both count the same way.
 */
export function SpendingPanel({ parts, total, formatCurrency }: { parts: { label: string; amount: number }[]; total: number; formatCurrency: Money }) {
  const { t } = useTranslation();
  if (total <= 0) return null;
  const colour = (index: number, isLast: boolean) => (isLast && parts.length > SPEND_COLOURS.length ? "var(--color-border-primary)" : SPEND_COLOURS[index % SPEND_COLOURS.length]);

  return (
    <Panel title={t("overview.whereItWent")} action={<Link to="/analytics" className="small text-decoration-none">{t("overview.openAnalytics")}</Link>}>
      <div className={styles.spendBar} aria-hidden>
        {parts.map((part, index) => (
          <span key={part.label} style={{ width: `${(part.amount / total) * 100}%`, background: colour(index, index === parts.length - 1) }} />
        ))}
      </div>
      <dl className={styles.madeOf}>
        {parts.map((part, index) => (
          <div key={part.label}>
            <dt>
              <span className={styles.spendKey} style={{ background: colour(index, index === parts.length - 1) }} aria-hidden />
              {part.label}
            </dt>
            <dd>{formatCurrency(part.amount)}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
