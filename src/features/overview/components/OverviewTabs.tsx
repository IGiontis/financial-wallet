import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiChevronRight } from "react-icons/fi";
import { Sparkline } from "./Sparkline";
import type { AttentionItem } from "../overviewTabs";
import type { NetWorthPoint } from "../../analytics/netWorthUtils";
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
 * Only what wants doing, most urgent first. When nothing does, it says so in
 * one line and gets out of the way — the tab's whole point is that on a quiet
 * day there is nothing to read.
 */
export function AttentionList({ items, formatCurrency }: { items: AttentionItem[]; formatCurrency: Money }) {
  const { t } = useTranslation();

  if (items.length === 0) {
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

  return (
    <Panel title={t("overview.needsYou", { count: items.length })}>
      <div className={styles.attention}>
        {items.map((item) => (
          <Link key={`${item.kind}-${item.id}`} to={item.kind === "bill" ? "/bills" : "/debts"} className={styles.attentionRow}>
            <span className={styles.attentionName}>
              <span className="text-truncate">{item.name}</span>
              <Badge pill color={item.late ? "danger-subtle" : "warning-subtle"} className={item.late ? "text-danger-emphasis" : "text-warning-emphasis"}>
                {item.late
                  ? t("overview.lateBy", { count: Math.abs(item.days) })
                  : item.days === 0
                    ? t("overview.dueToday")
                    : t("overview.dueIn", { count: item.days })}
              </Badge>
            </span>
            <span className={styles.attentionAmount}>{formatCurrency(item.amount)}</span>
            <FiChevronRight size={16} className="text-body-secondary flex-shrink-0" aria-hidden />
          </Link>
        ))}
      </div>
    </Panel>
  );
}

/** Two figures for the month so far — the whole month in one line. */
export function MonthInOut({ income, expenses, formatCurrency, sub }: { income: number; expenses: number; formatCurrency: Money; sub?: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.pair}>
      <Panel title={t("overview.cameIn")}>
        <div className={styles.pairValue} style={{ color: "var(--color-income-text)" }}>
          {formatCurrency(income)}
        </div>
        {sub && <div className="small text-body-secondary">{sub}</div>}
      </Panel>
      <Panel title={t("overview.wentOut")}>
        <div className={styles.pairValue} style={{ color: "var(--color-expense-text)" }}>
          {formatCurrency(expenses)}
        </div>
        <div className="small text-body-secondary">{t("overview.soFarThisMonth")}</div>
      </Panel>
    </div>
  );
}

// ─── The month ──────────────────────────────────────────────────────────────

/**
 * "What is left at pay day" — today's balance less the bills that fall before
 * it. A plain answer, labelled as one; the planner has the full projection.
 */
export function PaydayVerdict({
  left,
  owed,
  count,
  payday,
  known,
  formatCurrency,
  locale,
}: {
  left: number;
  owed: number;
  count: number;
  payday: Date;
  /** False when no pay day is set, and the month's end stands in for it. */
  known: boolean;
  formatCurrency: Money;
  locale: string;
}) {
  const { t } = useTranslation();
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(payday);
  const good = left >= 0;

  return (
    <Panel title={t(known ? "overview.leftAtPayday" : "overview.leftAtMonthEnd", { date: day })} action={<Link to="/planner" className="small text-decoration-none">{t("overview.openPlanner")}</Link>}>
      <div className={styles.verdictValue} style={{ color: good ? "var(--color-income-text)" : "var(--color-expense-text)" }}>
        {formatCurrency(left)}
      </div>
      <div className="small text-body-secondary">
        {count > 0 ? t("overview.afterBills", { count, amount: formatCurrency(owed) }) : t("overview.noBillsBefore")}
      </div>
      {!known && <div className="small text-body-secondary mt-1">{t("overview.setPayday")}</div>}
    </Panel>
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
