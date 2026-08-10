import { useMemo, useState } from "react";
import { Button, Collapse } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import type { Category, Transaction } from "../../../shared/types/IndexTypes";
import { categoryLabel } from "../../../shared/utils/categories";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import {
  bucketOverTime,
  categorySplit,
  compareWithPrevious,
  computeStats,
  pickBucket,
  spanInDays,
  topPayees,
  OTHER_CATEGORY_ID,
  type Bucket,
  type InsightMode,
} from "../transactionInsights";
import styles from "./css/TransactionInsights.module.css";

/** Slice colours reuse the semantic accents so the panel matches the app. */
const SLICE_COLORS = ["var(--bs-primary)", "var(--color-expense)", "var(--color-income)", "var(--color-invest)", "var(--color-goal)", "var(--color-text-secondary)"];

const DONUT_RADIUS = 15.9155; // circumference ≈ 100, so dasharray reads as %

interface InsightsProps {
  /** Rows currently shown by the filter. */
  transactions: Transaction[];
  /** Every row, needed to look at the stretch *before* the filter. */
  allTransactions: Transaction[];
  categories: Category[];
  formatCurrency: (n: number) => string;
  fromDate: Date | null;
  toDate: Date | null;
  /** Jump the table to one category when its slice is clicked. */
  onSelectCategory: (categoryName: string) => void;
}

export function TransactionInsights({ transactions, allTransactions, categories, formatCurrency, fromDate, toDate, onSelectCategory }: InsightsProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useLocalStorage("transactions-insights-open", true);
  const [mode, setMode] = useState<InsightMode>("expense");

  const lang = i18n.resolvedLanguage ?? "en";
  const span = useMemo(() => spanInDays(fromDate, toDate, transactions), [fromDate, toDate, transactions]);
  const bucket = pickBucket(span);

  const bucketLabel = useMemo(() => {
    const dayFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });
    const monthFmt = new Intl.DateTimeFormat(lang, { month: "short" });
    return (start: Date, b: Bucket) => (b === "month" ? monthFmt.format(start) : dayFmt.format(start));
  }, [lang]);

  const stats = useMemo(() => computeStats(transactions, mode, span), [transactions, mode, span]);
  const slices = useMemo(() => categorySplit(transactions, mode), [transactions, mode]);
  const buckets = useMemo(() => bucketOverTime(transactions, mode, bucket, bucketLabel), [transactions, mode, bucket, bucketLabel]);
  const payees = useMemo(() => topPayees(transactions, mode), [transactions, mode]);

  const comparison = useMemo(
    () => (fromDate && toDate ? compareWithPrevious(allTransactions, mode, fromDate, toDate, stats.total) : undefined),
    [allTransactions, mode, fromDate, toDate, stats.total],
  );

  const nameFor = (categoryId: string): string => {
    if (categoryId === OTHER_CATEGORY_ID) return t("transactions.otherCategories", { count: slices.find((s) => s.categoryId === categoryId)?.count ?? 0 });
    if (categoryId === "__investment__") return categoryLabel("Investments", t);
    const category = categories.find((c) => c.id === categoryId);
    return category ? `${category.icon ?? ""} ${categoryLabel(category.name, t)}`.trim() : "—";
  };

  const maxBucket = Math.max(...buckets.map((b) => b.amount), 0);
  // Aim for at most ~8 visible captions regardless of how many bars there are.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));
  const maxPayee = payees[0]?.amount ?? 0;
  const dateFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });

  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <Button color="link" className="p-0 text-decoration-none d-flex align-items-center gap-1 text-body-emphasis" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => setOpen((v) => !v)}>
          {t("transactions.insights")}
          {open ? <FiChevronUp size={15} /> : <FiChevronDown size={15} />}
        </Button>

        {open && (
          <div className="btn-group btn-group-sm" role="group">
            <Button color="secondary" outline={mode !== "expense"} size="sm" style={{ fontSize: 11.5 }} onClick={() => setMode("expense")} active={mode === "expense"}>
              {t("transactions.expense")}
            </Button>
            <Button color="secondary" outline={mode !== "income"} size="sm" style={{ fontSize: 11.5 }} onClick={() => setMode("income")} active={mode === "income"}>
              {t("transactions.income")}
            </Button>
          </div>
        )}
      </div>

      <Collapse isOpen={open}>
        {stats.count === 0 ? (
          <p className="text-body-secondary mb-0" style={{ fontSize: 12.5 }}>
            {t("transactions.noneFound")}
          </p>
        ) : (
          <div className={styles.panel}>
            {/* ── Headline figures ── */}
            <div className={styles.card}>
              <div className={`${styles.cardTitle} mb-2`}>{t("transactions.summary")}</div>
              <div className={styles.statGrid}>
              <div className={styles.stat}>
                <div className={styles.statLabel}>{t("transactions.perDay")}</div>
                <div className={styles.statValue}>{formatCurrency(stats.perDay)}</div>
                <div className={styles.statSub}>{t("transactions.onAverage")}</div>
              </div>

              <div className={styles.stat}>
                <div className={styles.statLabel}>{t("transactions.largest")}</div>
                <div className={styles.statValue}>{stats.largest ? formatCurrency(stats.largest.amount) : "—"}</div>
                <div className={styles.statSub}>{stats.largest ? `${stats.largest.description} · ${dateFmt.format(stats.largest.date)}` : "—"}</div>
              </div>

              <div className={styles.stat}>
                <div className={styles.statLabel}>{t("transactions.typical")}</div>
                <div className={styles.statValue}>{formatCurrency(stats.median)}</div>
                <div className={styles.statSub}>{t("transactions.medianPayment")}</div>
              </div>

              <div className={styles.stat}>
                <div className={styles.statLabel}>{t("transactions.vsPrevious")}</div>
                {comparison?.percentage === undefined ? (
                  <>
                    <div className={styles.statValue}>—</div>
                    <div className={styles.statSub}>{t("transactions.noPriorData")}</div>
                  </>
                ) : (
                  <>
                    {/* More spending is bad, more income is good — the colour
                        has to follow the mode, not the sign alone. */}
                    <div
                      className={styles.statValue}
                      style={{ color: comparison.difference === 0 ? undefined : (comparison.difference > 0) === (mode === "expense") ? "var(--color-expense)" : "var(--color-income)" }}
                    >
                      {comparison.difference > 0 ? "+" : ""}
                      {Math.round(comparison.percentage)}%
                    </div>
                    <div className={styles.statSub}>
                      {t(comparison.difference >= 0 ? "transactions.moreThanBefore" : "transactions.lessThanBefore", { amount: formatCurrency(Math.abs(comparison.difference)) })}
                    </div>
                  </>
                )}
                </div>
              </div>
            </div>

            <div className={styles.chartRow}>
              {/* ── Where it went ── */}
              <div className={styles.card}>
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.cardTitle}>{mode === "expense" ? t("transactions.whereItWent") : t("transactions.whereItCameFrom")}</div>
                    <div className={styles.cardHint}>{t("transactions.tapSliceToFilter")}</div>
                  </div>
                  {/* Headline sits here rather than inside the ring — a five- or
                      six-figure total simply doesn't fit in the hole. */}
                  <div className="text-end flex-shrink-0">
                    <div className={styles.headlineAmount} style={{ color: mode === "expense" ? "var(--color-expense)" : "var(--color-income)" }}>
                      {formatCurrency(stats.total)}
                    </div>
                    <div className={styles.statSub}>{t("transactions.transactionCount", { count: stats.count })}</div>
                  </div>
                </div>

                <div className={`${styles.donutWrap} mt-3`}>
                  <div className={styles.donutBox}>
                    <svg viewBox="0 0 42 42" className={styles.donut} role="img" aria-label={t("transactions.categorySplit")}>
                      <circle cx="21" cy="21" r={DONUT_RADIUS} fill="none" stroke="var(--color-background-secondary)" strokeWidth="6" />
                      {slices.reduce<{ nodes: React.ReactNode[]; offset: number }>(
                        (acc, slice, i) => {
                          acc.nodes.push(
                            <circle
                              key={slice.categoryId}
                              cx="21"
                              cy="21"
                              r={DONUT_RADIUS}
                              fill="none"
                              stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
                              strokeWidth="6"
                              strokeDasharray={`${slice.percentage} ${100 - slice.percentage}`}
                              strokeDashoffset={-acc.offset}
                            />,
                          );
                          return { nodes: acc.nodes, offset: acc.offset + slice.percentage };
                        },
                        { nodes: [], offset: 0 },
                      ).nodes}
                    </svg>
                    {slices.length > 0 && (
                      <div className={styles.donutHole}>
                        <span className={styles.donutTotal}>{Math.round(slices[0].percentage)}%</span>
                        <span className={styles.donutCaption}>{t("transactions.topShare")}</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.legend}>
                    {slices.map((slice, i) => {
                      const category = categories.find((c) => c.id === slice.categoryId);
                      const clickable = !!category;
                      return (
                        <button
                          key={slice.categoryId}
                          type="button"
                          className={styles.legendRow}
                          disabled={!clickable}
                          onClick={() => category && onSelectCategory(category.name)}
                          title={clickable ? t("transactions.filterByCategory", { name: categoryLabel(category.name, t) }) : undefined}
                        >
                          <span className={styles.swatch} style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                          <span className={styles.legendName}>{nameFor(slice.categoryId)}</span>
                          <span className={styles.legendAmount}>{formatCurrency(slice.amount)}</span>
                          <span className={styles.legendPct}>{Math.round(slice.percentage)}%</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── Over time ── */}
              <div className={styles.card}>
                <div className={styles.cardTitle}>{t("transactions.overTime")}</div>
                <div className={`${styles.cardHint} mb-3`}>{t(bucket === "day" ? "transactions.byDay" : bucket === "week" ? "transactions.byWeek" : "transactions.byMonth")}</div>

                <div className={styles.bars}>
                  {buckets.map((b, i) => (
                    <div key={b.key} className={styles.barCol} title={`${b.label} · ${formatCurrency(b.amount)}`}>
                      <div className={`${styles.bar} ${mode === "income" ? styles.barIncome : ""}`} style={{ height: maxBucket > 0 ? `${(b.amount / maxBucket) * 100}%` : "2px" }} />
                      {/* A month of daily bars would collide, so only every
                          nth label is drawn — the rest keep their tooltip. */}
                      <span className={styles.barLabel}>{i % labelEvery === 0 ? b.label : " "}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Top payees ── */}
            {payees.length > 0 && (
              <div className={styles.card}>
                <div className={`${styles.cardTitle} mb-3`}>{mode === "expense" ? t("transactions.whoYouPayMost") : t("transactions.whoPaysYouMost")}</div>
                <div className="d-flex flex-column gap-2">
                  {payees.map((p) => (
                    <div key={p.name}>
                      <div className="d-flex justify-content-between gap-2 mb-1" style={{ fontSize: 12 }}>
                        <span className={styles.payeeName}>{p.name}</span>
                        <span className="flex-shrink-0">
                          <span className="fw-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {formatCurrency(p.amount)}
                          </span>
                          <span className="text-body-secondary"> · {t("transactions.timesCount", { count: p.count })}</span>
                        </span>
                      </div>
                      <div className={styles.payeeTrack}>
                        <div className={styles.payeeFill} style={{ width: maxPayee > 0 ? `${(p.amount / maxPayee) * 100}%` : "0%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Collapse>
    </div>
  );
}
