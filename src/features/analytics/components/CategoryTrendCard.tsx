import { useMemo, useState } from "react";
import { Button, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronLeft, FiChevronRight, FiSliders, FiX } from "react-icons/fi";
import type { Category, Transaction } from "../../../shared/types/IndexTypes";
import { findCategory } from "../../../shared/utils/categories";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import { SearchInput } from "../../../shared/components/SearchInput";
import { monthlyTrend, spendingCategories, trendYears, yearlyTrend, TREND_SPANS, type TrendBucket, type TrendSpan } from "../categoryTrend";
import { ChartCard } from "./ChartCard";
import { ChartDetails, DetailsTable, type DetailsColumn } from "./DetailsTable";
import { Legend } from "./Legend";
import { seriesColor } from "./chartTheme";
import CategoryTrendChart, { type TrendPoint } from "./CategoryTrendChart";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "./css/Analytics.module.css";

type Mode = "months" | "years";

/** Enough lines to compare; past this the chart is a tangle and the table says it better. */
const MAX_PICKED = 8;

/**
 * «Πώς πήγε μια κατηγορία»: one or more categories, month by month over up to a
 * year — or, for longer than that, year by year from 2024.
 *
 * Its own stretch, not the page's range: the question is "how did groceries go
 * January to March", which the 1/3/6/12-month picker at the top cannot ask.
 * Worked out from the transactions already on hand (`categoryTrend`).
 */
export function CategoryTrendCard({ transactions, categories, now, nameFor, formatCurrency, noData }: { transactions: Transaction[]; categories: Category[]; now: Date; nameFor: (id: string) => string; formatCurrency: (n: number) => string; noData: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const options = useMemo(() => spendingCategories(transactions), [transactions]);
  const [stored, setStored] = useLocalStorage<string[]>("analytics-trend-categories", []);
  // What was picked, of what still has spending; the biggest category until something is.
  const picked = useMemo(() => {
    const known = new Set(options.map((o) => o.categoryId));
    const kept = (Array.isArray(stored) ? stored : []).filter((id) => known.has(id)).slice(0, MAX_PICKED);
    return kept.length > 0 ? kept : options.slice(0, 1).map((o) => o.categoryId);
  }, [stored, options]);

  const [mode, setMode] = useLocalStorage<Mode>("analytics-trend-mode", "months");
  const [span, setSpan] = useLocalStorage<TrendSpan>("analytics-trend-span", 6);
  const safeSpan: TrendSpan = TREND_SPANS.includes(span) ? span : 6;
  // How many months back the stretch ends: 0 is this month.
  const [back, setBack] = useState(0);
  const end = useMemo(() => new Date(now.getFullYear(), now.getMonth() - back, 1), [now, back]);
  const [choosing, setChoosing] = useState(false);

  const years = useMemo(() => trendYears(transactions, now), [transactions, now]);
  const buckets: TrendBucket[] = useMemo(
    () => (mode === "years" ? yearlyTrend(transactions, picked, years) : monthlyTrend(transactions, picked, end, safeSpan)),
    [mode, transactions, picked, years, end, safeSpan],
  );

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit" }), [lang]);
  const longFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short", year: "numeric" }), [lang]);
  const labelOf = (b: TrendBucket) => (mode === "years" ? b.key : monthFmt.format(b.start));
  const points: TrendPoint[] = useMemo(() => buckets.map((b) => ({ key: b.key, label: mode === "years" ? b.key : monthFmt.format(b.start), total: b.total, ...b.values })), [buckets, mode, monthFmt]);

  const series = picked.map((id) => ({ id, name: `${findCategory(categories, id)?.icon ?? ""} ${nameFor(id)}`.trim() }));
  const total = Math.round(buckets.reduce((sum, b) => sum + b.total, 0) * 100) / 100;
  const bars = mode === "years" || picked.length === 1;
  const stretch = mode === "years" ? `${years[0]}–${years[years.length - 1]}` : `${longFmt.format(buckets[0]?.start ?? end)} – ${longFmt.format(end)}`;

  const toolbar = (
    <div className={styles.trendTools}>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <div className={segmented.group} role="group" aria-label={t("analytics.trend.view")} style={{ padding: "var(--space-0)" }}>
          {(["months", "years"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} className={`${segmented.item} ${styles.smallSeg} ${mode === m ? segmented.active : ""}`} onClick={() => setMode(m)}>
              {t(`analytics.trend.${m}`)}
            </button>
          ))}
        </div>
        {mode === "months" && (
          <div className={segmented.group} role="group" aria-label={t("analytics.trend.span")} style={{ padding: "var(--space-0)" }}>
            {TREND_SPANS.map((s) => (
              <button key={s} type="button" aria-pressed={safeSpan === s} className={`${segmented.item} ${styles.smallSeg} ${safeSpan === s ? segmented.active : ""}`} onClick={() => setSpan(s)}>
                {t("analytics.trend.monthsCount", { count: s })}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2">
        {mode === "months" ? (
          <div className={styles.stepper}>
            <button type="button" className={styles.stepBtn} onClick={() => setBack((b) => b + 1)} aria-label={t("common.prev")}>
              <FiChevronLeft aria-hidden />
            </button>
            <span className={styles.stepLabel}>{stretch}</span>
            <button type="button" className={styles.stepBtn} onClick={() => setBack((b) => Math.max(0, b - 1))} disabled={back === 0} aria-label={t("common.next")}>
              <FiChevronRight aria-hidden />
            </button>
          </div>
        ) : (
          <span className={styles.stepLabel}>{stretch}</span>
        )}
        <Button color="secondary" outline size="sm" className="d-inline-flex align-items-center gap-1 ms-auto" onClick={() => setChoosing(true)} disabled={options.length === 0}>
          <FiSliders aria-hidden /> {t("analytics.trend.pick", { count: picked.length })}
        </Button>
      </div>

      {picked.length > 0 && (
        <div className={styles.trendChips}>
          {series.map((s, i) => (
            <span key={s.id} className={styles.trendChip}>
              <span className={styles.swatch} style={{ background: seriesColor(i) }} aria-hidden />
              {s.name}
              {picked.length > 1 && (
                <button type="button" className={styles.trendChipX} onClick={() => setStored(picked.filter((id) => id !== s.id))} aria-label={t("analytics.trend.remove", { name: s.name })}>
                  <FiX aria-hidden />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const nothing = buckets.every((b) => b.total === 0);
  const columns: DetailsColumn<TrendBucket>[] = [
    { key: "when", label: mode === "years" ? t("analytics.trend.year") : t("analytics.details.month"), cell: labelOf },
    ...series.map((s) => ({ key: s.id, label: s.name, numeric: true, cell: (b: TrendBucket) => formatCurrency(b.values[s.id] ?? 0), foot: formatCurrency(buckets.reduce((sum, b) => sum + (b.values[s.id] ?? 0), 0)) })),
    ...(series.length > 1 ? [{ key: "total", label: t("common.total"), numeric: true, cell: (b: TrendBucket) => formatCurrency(b.total), foot: formatCurrency(total) }] : []),
  ];
  const legend = series.length > 1 ? <Legend items={series.map((s, i) => ({ color: seriesColor(i), label: s.name }))} /> : undefined;

  return (
    <>
      <ChartCard
        wide
        tall
        title={t("analytics.trend.title")}
        hint={t("analytics.trend.hint")}
        value={nothing ? undefined : formatCurrency(total)}
        valueTone="expense"
        toolbar={toolbar}
        empty={options.length === 0 || nothing ? noData : undefined}
        details={{
          content: (
            <ChartDetails
              note={`${series.map((s) => s.name).join(", ")} · ${stretch}`}
              chart={<CategoryTrendChart data={points} series={series} bars={bars} formatCurrency={formatCurrency} />}
              legend={legend}
              tableTitle={t("analytics.details.table")}
              table={<DetailsTable rows={[...buckets].reverse()} rowKey={(b) => b.key} columns={columns} footLabel={t("common.total")} />}
            />
          ),
        }}
      >
        <CategoryTrendChart data={points} series={series} bars={bars} formatCurrency={formatCurrency} compact />
      </ChartCard>

      {choosing && (
        <CategoryChooser
          options={options.map((o) => ({ id: o.categoryId, name: `${findCategory(categories, o.categoryId)?.icon ?? "•"} ${nameFor(o.categoryId)}`, total: o.total }))}
          picked={picked}
          formatCurrency={formatCurrency}
          onDone={(ids) => {
            setStored(ids);
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
    </>
  );
}

/** Ticks with a search box over them: the categories with spending, biggest first. */
function CategoryChooser({
  options,
  picked,
  formatCurrency,
  onDone,
  onClose,
}: {
  options: { id: string; name: string; total: number }[];
  picked: string[];
  formatCurrency: (n: number) => string;
  onDone: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string[]>(picked);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle ? options.filter((o) => o.name.toLocaleLowerCase().includes(needle)) : options;
  const full = chosen.length >= MAX_PICKED;

  const flip = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : full ? current : [...current, id]));

  return (
    <Modal isOpen toggle={onClose} centered scrollable size="md">
      <ModalHeader toggle={onClose}>{t("analytics.trend.chooseTitle")}</ModalHeader>
      <ModalBody>
        <SearchInput value={query} onChange={setQuery} placeholder={t("analytics.trend.search")} block />
        <p className="small text-body-secondary mt-2 mb-2">{t("analytics.trend.chooseHint", { max: MAX_PICKED })}</p>
        <div className={styles.chooserList}>
          {shown.map((o) => {
            const on = chosen.includes(o.id);
            return (
              <Label key={o.id} check className={styles.chooserRow}>
                <Input type="checkbox" checked={on} disabled={!on && full} onChange={() => flip(o.id)} />
                <span className={styles.chooserName}>{o.name}</span>
                <span className={styles.chooserTotal}>{formatCurrency(o.total)}</span>
              </Label>
            );
          })}
          {shown.length === 0 && <p className="small text-body-secondary mb-0">{t("analytics.trend.noMatch")}</p>}
        </div>
      </ModalBody>
      <ModalFooter className="justify-content-between">
        <Button color="secondary" outline onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button color="primary" disabled={chosen.length === 0} onClick={() => onDone(options.map((o) => o.id).filter((id) => chosen.includes(id)))}>
          {t("analytics.trend.show", { count: chosen.length })}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
