import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiArrowDownLeft, FiArrowUpRight, FiCheckCircle, FiChevronRight } from "react-icons/fi";
import { Sparkline } from "./Sparkline";
import type { AttentionItem } from "../overviewTabs";
import type { NetWorthPoint } from "../../analytics/netWorthUtils";
import { daysLate, type ResolvedOccurrence } from "../../plannerPage/plannerActuals";
import type { IncomeStatus } from "../../incomes/incomesUtils";
import type { Category, Transaction } from "../../../shared/types/IndexTypes";
import { categoryLabel } from "../../../shared/utils/categories";
import { firestoreToDate } from "../../../shared/utils/dates";
import { isPlainExpense } from "../overviewUtils";
import styles from "../pages/css/OverviewPage.module.css";
import { findCategory } from "../../../shared/utils/categories";

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
 * What wants you, most urgent first — to look at, not to act on.
 *
 * The Overview is for seeing what has been entered; the doing happens on the
 * page each thing belongs to. So every row is a way there: a bill to Πάγια, a
 * debt to Χρέη, a late income — or one waiting for «ήταν ήδη στην τράπεζα;» —
 * to Έσοδα, a late or unconfirmed one-off or instalment to the
 * Προγραμματισμός, where its own buttons are. When nothing wants doing it says
 * so in one line and gets out of the way — on a quiet day there is nothing to
 * read.
 */
export function AttentionList({
  items,
  incomes = [],
  late = [],
  unconfirmed = [],
  now,
  formatCurrency,
}: {
  items: AttentionItem[];
  /** Incomes late, or waiting for the bank question — `useIncomes().attention`, each with its name. */
  incomes?: { status: IncomeStatus; name: string }[];
  /** Planner occurrences overdue: an instalment not seen, a one-off not in. */
  late?: ResolvedOccurrence[];
  /** A one-off with no record that the last bank reading may already hold. */
  unconfirmed?: ResolvedOccurrence[];
  now: Date;
  formatCurrency: Money;
}) {
  const { t, i18n } = useTranslation();
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short" });

  if (items.length === 0 && incomes.length === 0 && late.length === 0 && unconfirmed.length === 0) {
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

  // A small box each: the name over the amount, the tag beside it. A full-width
  // row for "Water · 2 days late · 60 €" left a wide screen mostly empty.
  const row = (key: string, to: string, name: ReactNode, tag: ReactNode, amount: number) => (
    <Link key={key} to={to} className={styles.attentionRow}>
      <span className={styles.attentionTop}>
        <span className={styles.attentionName}>{name}</span>
        <FiChevronRight size={15} className="text-body-secondary flex-shrink-0" aria-hidden />
      </span>
      <span className={styles.attentionBottom}>
        <span className={styles.attentionAmount}>{formatCurrency(amount)}</span>
        {tag}
      </span>
    </Link>
  );

  return (
    <Panel title={t("overview.needsYou", { count: items.length + incomes.length + late.length + unconfirmed.length })}>
      <div className={styles.attention}>
        {/* The incomes first, as «Έσοδα» words them; answered there. */}
        {incomes.map(({ status, name }) =>
          status.state === "ask"
            ? row(
                status.key,
                "/incomes",
                t("incomes.ask.title", { name }),
                <Badge pill color="warning-subtle" className="text-warning-emphasis">
                  {t("overview.waitsForAnswer")}
                </Badge>,
                status.expected,
              )
            : row(status.key, "/incomes", name, badge(Math.max(1, status.lateDays ?? 1), 0), status.expected),
        )}
        {unconfirmed.map((occurrence) =>
          row(
            occurrence.key,
            "/planner",
            t("planner.unconfirmedOther", { label: occurrence.label, date: dateFmt.format(occurrence.date) }),
            <Badge pill color="warning-subtle" className="text-warning-emphasis">
              {t("overview.waitsForAnswer")}
            </Badge>,
            Math.abs(occurrence.amount),
          ),
        )}
        {late.map((occurrence) => row(occurrence.key, "/planner", occurrence.label, badge(Math.max(1, daysLate(occurrence, now)), 0), Math.abs(occurrence.amount)))}
        {items.map((item) => row(`${item.kind}-${item.id}`, item.kind === "bill" ? "/bills" : "/debts", item.name, badge(item.late ? Math.abs(item.days) : undefined, item.days), item.amount))}
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

  const categoryOf = (tx: Transaction) => findCategory(categories, tx.categoryId);
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
  const net = Math.round((income - expenses) * 100) / 100;
  const whole = income + expenses;

  // One side of the card: an arrow in its colour, and beside it what it is,
  // how much, and the line under that — read across, not down a column.
  const side = (tone: "income" | "expense", label: string, amount: number, note?: ReactNode) => (
    <div className={styles.inOutSide}>
      <span className={styles.inOutIcon} style={{ color: `var(--color-${tone}-text)`, background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)` }} aria-hidden>
        {tone === "income" ? <FiArrowDownLeft size={18} /> : <FiArrowUpRight size={18} />}
      </span>
      <span className={styles.inOutText}>
        <span className={styles.inOutLabel}>{label}</span>
        <span className={styles.inOutValue} style={{ color: `var(--color-${tone}-text)` }}>
          {formatCurrency(amount)}
        </span>
        {note}
      </span>
    </div>
  );

  return (
    <Card className="mb-0">
      <CardBody className="p-3">
        <div className={styles.inOut}>
          {side(
            "income",
            t("overview.cameIn"),
            income,
            <>
              {sub && <span className={styles.inOutNote}>{sub}</span>}
              {unlogged > 0 && (
                <Link to="/accounts" className={`${styles.inOutNote} text-decoration-none`} style={{ color: "var(--color-income-text)" }}>
                  {t("overview.unloggedIn", { amount: formatCurrency(unlogged) })}
                </Link>
              )}
            </>,
          )}
          {side(
            "expense",
            t("overview.wentOut"),
            expenses,
            <>
              <span className={styles.inOutNote}>{t("overview.soFarThisMonth")}</span>
              {unlogged < 0 && (
                <Link to="/accounts" className={`${styles.inOutNote} text-decoration-none`} style={{ color: "var(--color-expense-text)" }}>
                  {t("overview.unloggedOut", { amount: formatCurrency(-unlogged) })}
                </Link>
              )}
            </>,
          )}
        </div>

        {/* The two against each other, and what is left between them. */}
        {whole > 0 && (
          <div className={styles.inOutBar} aria-hidden>
            <span style={{ width: `${(income / whole) * 100}%`, background: "var(--color-income)" }} />
            <span style={{ width: `${(expenses / whole) * 100}%`, background: "var(--color-expense)" }} />
          </div>
        )}
        <div className={styles.inOutNet}>
          <span>{t("overview.monthNet")}</span>
          <span style={{ color: net > 0 ? "var(--color-income-text)" : net < 0 ? "var(--color-expense-text)" : undefined }}>
            {net > 0 ? "+" : net < 0 ? "−" : ""}
            {formatCurrency(Math.abs(net))}
          </span>
        </div>
      </CardBody>
    </Card>
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
