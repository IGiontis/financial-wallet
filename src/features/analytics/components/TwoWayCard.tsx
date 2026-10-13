import { useEffect, useMemo } from "react";
import { FormGroup, Input, Label } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { Category, Transaction } from "../../../shared/types/IndexTypes";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import { findCategory } from "../../../shared/utils/categories";
import { twoWay, twoWayOptions, type TwoWay } from "../twoWay";
import type { AnalyticsRange } from "../analyticsUtils";
import { ChartCard } from "./ChartCard";
import { ChartDetails, DetailsTable, type DetailsColumn } from "./DetailsTable";
import { Legend } from "./Legend";
import { signedWith } from "./chartTheme";
import TwoWayChart, { type TwoWayPoint } from "./TwoWayChart";
import segmented from "../../../shared/css/Segmented.module.css";

type Format = (n: number) => string;

/** The figures under the chart: each way how many times and how much, the net, what came back. */
function TwoWayFigures({ data, inWord, outWord, formatCurrency, dateFmt }: { data: TwoWay; inWord: string; outWord: string; formatCurrency: Format; dateFmt: Intl.DateTimeFormat }) {
  const { t } = useTranslation();
  const signed = signedWith(formatCurrency);
  const tile = (label: string, value: string, sub: string, color: string) => (
    <div className="col-4">
      <div className="h-100 rounded-3 px-2 py-2" style={{ background: "var(--color-background-secondary)" }}>
        <div className="text-body-secondary text-truncate" style={{ fontSize: 11.5 }}>
          {label}
        </div>
        <div className="fw-semibold text-truncate" style={{ color, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </div>
        <div className="text-body-secondary" style={{ fontSize: 11.5 }}>
          {sub}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-3">
      <div className="row g-2">
        {tile(inWord, formatCurrency(data.in), t("analytics.twoWay.times", { count: data.inCount }), "var(--color-income)")}
        {tile(outWord, formatCurrency(data.out), t("analytics.twoWay.times", { count: data.outCount }), "var(--color-expense)")}
        {tile(
          t("analytics.twoWay.net"),
          signed(data.net),
          data.returned !== undefined && data.in > 0 ? t("analytics.twoWay.returned", { percent: Math.round(data.returned * 100) }) : "—",
          data.net > 0 ? "var(--color-income)" : data.net < 0 ? "var(--color-expense)" : "var(--color-text-primary)",
        )}
      </div>
      {(data.biggestIn || data.biggestOut) && (
        <p className="small text-body-secondary mb-0 mt-2">
          {[
            data.biggestIn && t("analytics.twoWay.biggestIn", { amount: formatCurrency(data.biggestIn.amount), date: dateFmt.format(data.biggestIn.date) }),
            data.biggestOut && t("analytics.twoWay.biggestOut", { amount: formatCurrency(data.biggestOut.amount), date: dateFmt.format(data.biggestOut.date) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * «Μία κατηγορία, μέσα κι έξω»: pick a category — income and expense ones in
 * one list — and see what came in under it against what went out, how many
 * times each, and where that leaves you. See `twoWay` for how the other side
 * of a one-sided category is found.
 */
export function TwoWayCard({
  transactions,
  categories,
  from,
  now,
  range,
  nameFor,
  formatCurrency,
}: {
  transactions: Transaction[];
  categories: Category[];
  from: Date | null;
  now: Date;
  range: AnalyticsRange;
  nameFor: (id: string) => string;
  formatCurrency: Format;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  // Only what has money both ways: a category that only ever goes out is
  // already on the page's other cards, and here it would be one line on zero.
  const options = useMemo(() => twoWayOptions(transactions, categories).filter((o) => o.bothWays), [transactions, categories]);
  const [stored, setStored] = useLocalStorage<string>("analytics-two-way", "");
  const [running, setRunning] = useLocalStorage<boolean>("analytics-two-way-running", false);
  const [linkNames, setLinkNames] = useLocalStorage<boolean>("analytics-two-way-names", true);

  // The one chosen last, while it still has records; otherwise the first offered.
  const selected = options.some((o) => o.id === stored) ? stored : (options[0]?.id ?? "");
  useEffect(() => {
    if (selected && selected !== stored) setStored(selected);
  }, [selected, stored, setStored]);

  const byWeek = range === "1m";
  const data = useMemo(() => (selected ? twoWay(transactions, categories, selected, { from, now, byWeek, linkNames }) : undefined), [transactions, categories, selected, from, now, byWeek, linkNames]);

  const labelFmt = useMemo(() => new Intl.DateTimeFormat(lang, byWeek ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" }), [lang, byWeek]);
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }), [lang]);
  const points: TwoWayPoint[] = useMemo(() => (data ? data.buckets.map((b) => ({ ...b, label: labelFmt.format(b.start) })) : []), [data, labelFmt]);

  const category = findCategory(categories, selected) as (Category & { icon?: string }) | undefined;
  const isIncome = category && "type" in category && category.type === "income";
  const inWord = t("analytics.twoWay.in");
  const outWord = t("analytics.twoWay.out");
  const optionText = (id: string, count: number) => `${findCategory(categories, id)?.icon ?? "•"} ${nameFor(id)} (${count})`;
  const signed = signedWith(formatCurrency);

  const toolbar = options.length > 0 && (
    <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
      <Input
        type="select"
        bsSize="sm"
        aria-label={t("analytics.twoWay.pick")}
        value={selected}
        onChange={(e) => setStored(e.target.value)}
        className="flex-grow-1"
        style={{ minWidth: 0, maxWidth: 320 }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {optionText(o.id, o.count)}
          </option>
        ))}
      </Input>
      <div className={segmented.group} role="group" aria-label={t("analytics.twoWay.view")} style={{ padding: 3 }}>
        {[false, true].map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={running === value}
            className={`${segmented.item} ${running === value ? segmented.active : ""}`}
            style={{ minHeight: 30, padding: "4px 10px" }}
            onClick={() => setRunning(value)}
          >
            {value ? t("analytics.twoWay.running") : byWeek ? t("analytics.twoWay.perWeek") : t("analytics.twoWay.perMonth")}
          </button>
        ))}
      </div>
    </div>
  );

  // Where the other side came from, said in words — and the switch for the names.
  const sources = data && (
    <div className="mt-2 small text-body-secondary">
      {data.siblingIds.length > 0 && <div>{t("analytics.twoWay.withTwin", { name: data.siblingIds.map(nameFor).join(", ") })}</div>}
      {data.linked.length > 0 && (
        <FormGroup switch className="mb-0 mt-1">
          <Input type="switch" id="two-way-names" checked={linkNames} onChange={(e) => setLinkNames(e.target.checked)} />
          <Label for="two-way-names" check>
            {t(isIncome ? "analytics.twoWay.namesOut" : "analytics.twoWay.namesIn", {
              names: data.linked
                .slice(0, 4)
                .map((l) => `${l.name} (${l.count})`)
                .join(", "),
            })}
          </Label>
        </FormGroup>
      )}
    </div>
  );

  const nothing = !data || data.inCount + data.outCount === 0;
  const legend = <Legend items={[{ color: "var(--color-income)", label: inWord }, { color: "var(--color-expense)", label: outWord }]} />;

  const columns: DetailsColumn<TwoWayPoint>[] = data
    ? [
        { key: "period", label: byWeek ? t("analytics.twoWay.week") : t("analytics.details.month"), cell: (r) => r.label },
        { key: "inCount", label: t("analytics.twoWay.inCountHead"), numeric: true, secondary: true, cell: (r) => r.inCount || "—", foot: data.inCount },
        { key: "in", label: inWord, numeric: true, cell: (r) => (r.in ? formatCurrency(r.in) : "—"), foot: formatCurrency(data.in) },
        { key: "outCount", label: t("analytics.twoWay.outCountHead"), numeric: true, secondary: true, cell: (r) => r.outCount || "—", foot: data.outCount },
        { key: "out", label: outWord, numeric: true, cell: (r) => (r.out ? formatCurrency(r.out) : "—"), foot: formatCurrency(data.out) },
        { key: "net", label: t("analytics.twoWay.net"), numeric: true, tone: (r) => r.net, cell: (r) => (r.in || r.out ? signed(r.net) : "—"), foot: signed(data.net) },
      ]
    : [];

  return (
    <ChartCard
      wide
      tall
      title={t("analytics.twoWay.title")}
      hint={t("analytics.twoWay.hint")}
      value={data && !nothing ? signed(data.net) : undefined}
      valueTone={data && data.net > 0 ? "income" : data && data.net < 0 ? "expense" : "neutral"}
      toolbar={toolbar}
      empty={options.length === 0 ? t("analytics.twoWay.noneYet") : nothing ? t("analytics.twoWay.nothingInRange") : undefined}
      footer={
        data && (
          <>
            {legend}
            <TwoWayFigures data={data} inWord={inWord} outWord={outWord} formatCurrency={formatCurrency} dateFmt={dateFmt} />
            {sources}
          </>
        )
      }
      details={
        data && {
          content: (
            <ChartDetails
              note={`${category?.icon ?? ""} ${nameFor(selected)}`.trim()}
              chart={<TwoWayChart data={points} running={running} formatCurrency={formatCurrency} />}
              legend={legend}
              extra={<TwoWayFigures data={data} inWord={inWord} outWord={outWord} formatCurrency={formatCurrency} dateFmt={dateFmt} />}
              tableTitle={t("analytics.details.table")}
              table={<DetailsTable rows={[...points].reverse()} rowKey={(r) => r.key} columns={columns} footLabel={t("common.total")} />}
            />
          ),
        }
      }
    >
      <TwoWayChart data={points} running={running} formatCurrency={formatCurrency} compact />
    </ChartCard>
  );
}
