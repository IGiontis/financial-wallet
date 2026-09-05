import { useMemo, useState } from "react";
import { Alert, Button, Container, Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiPlus, FiX } from "react-icons/fi";

import { SkeletonCard, SkeletonPageHeader } from "../../shared/components/Skeletons";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { useInvestmentGoals } from "../budget/useInvestments";
import { seriesColor } from "../analytics/components/chartTheme";
import type { BudgetLine } from "../plannerPage/plannerUtils";
import { allocate, applyPreset, assignRemainder, bucketCeiling, committedMonthly, extraFor, monthKey, PRESETS, setBucketAmount, type ExtraThisMonth } from "./allocationUtils";
import styles from "./css/Allocation.module.css";

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * What to do with what is left.
 *
 * The planner answers "do I get through the month?" — a projection, with a
 * verdict. This answers a different question: of the money that is genuinely
 * free once the unavoidable is paid, how should it be divided? The two share
 * their inputs and, deliberately, their storage: the buckets here *are* the
 * planner's budget lines. Decide it on this screen, see it projected on that
 * one. Two screens with two ideas of the food budget would be worse than
 * having neither.
 */
export function AllocationPage() {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrencyConverter();

  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: goals = [], isLoading: goalsLoading } = useInvestmentGoals();
  const { data: debts = [] } = useDebts();

  // Reads the planner's pay figure; writes nothing the planner reads. This
  // screen used to share the planner's budget lines outright, on the reasoning
  // that two screens should not hold two ideas of the food budget. That was
  // wrong about what the two screens are for: the planner holds what you have
  // decided is fixed, and this one is an exercise in dividing what is left.
  // Dragging a slider here to see how a month could go should not quietly
  // rewrite the plan you rely on there.
  const [storedSalary] = useLocalStorage("planner-salary", { amount: "", day: "" });
  const [storedLines, setLines] = useLocalStorage<BudgetLine[]>("allocation-buckets", []);
  const [storedExtra, setExtra] = useLocalStorage<ExtraThisMonth | null>("allocation-extra", null);

  const [now] = useState(() => new Date());

  const lines = useMemo(
    () => (Array.isArray(storedLines) ? storedLines.filter((l): l is BudgetLine => !!l && typeof l.id === "string" && Number.isFinite(l.amount)) : []),
    [storedLines],
  );

  const income = parseFloat(String(storedSalary?.amount ?? "")) || 0;
  const committed = useMemo(() => committedMonthly(bills, goals, debts, now), [bills, goals, debts, now]);
  const extra = useMemo(() => extraFor(storedExtra, now), [storedExtra, now]);
  const plan = useMemo(() => allocate(income, committed, lines, extra), [income, committed, lines, extra]);

  // Kept while a figure is being typed, so clearing the box does not read back
  // as "0" and put every further digit after it.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extraDraft, setExtraDraft] = useState<string | null>(null);
  const clearDraft = (id: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });

  const setAmount = (id: string, amount: number) => setLines(setBucketAmount(lines, id, amount, plan.free));
  const rename = (id: string, label: string) => setLines(lines.map((l) => (l.id === id ? { ...l, label } : l)));
  const remove = (id: string) => setLines(lines.filter((l) => l.id !== id));
  const setExtraAmount = (amount: number) => setExtra({ month: monthKey(now), label: storedExtra?.label ?? "", amount });
  const setExtraLabel = (label: string) => setExtra({ month: monthKey(now), label, amount: storedExtra?.amount ?? 0 });

  const addBucket = () => setLines([...lines, { id: newId(), label: t("allocation.newBucket"), amount: 0, kind: "expense" }]);

  const choosePreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    // Income lines are money arriving, not buckets — a preset replaces the
    // division of the pot, never what the pot is made of.
    const kept = lines.filter((l) => l.kind === "income");
    setLines([...kept, ...applyPreset(preset, plan.free, (key) => t(`allocation.buckets.${key}`), newId)]);
  };

  const giveRemainderTo = (id: string) => setLines(assignRemainder(lines, id, plan.unallocated));

  if (billsLoading || goalsLoading) {
    return (
      <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 820 }}>
        <SkeletonPageHeader />
        <SkeletonCard />
      </Container>
    );
  }

  const remainderTone = plan.unallocated > 0.005 ? styles.remainderOpen : plan.unallocated < -0.005 ? styles.remainderOver : styles.remainderDone;

  return (
    <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 820 }}>
      <div className="mb-3">
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("allocation.title")}</h1>
        <p className="small text-body-secondary mb-0">{t("allocation.subtitle")}</p>
      </div>

      {income <= 0 ? (
        <Alert color="secondary" className="small mb-0">
          {t("allocation.noSalary")}
        </Alert>
      ) : (
        <>
          {/* ── The pot ── */}
          <div className={styles.card}>
            <div className={styles.sum}>
              {t("allocation.equation", {
                income: formatCurrency(plan.income),
                bills: formatCurrency(committed.bills),
                goals: formatCurrency(committed.goals),
                debts: formatCurrency(committed.debts),
              })}
            </div>
            {extra > 0 && (
              <div className={styles.sum}>
                {t("allocation.lessExtra", { label: storedExtra?.label || t("allocation.extraFallback"), amount: formatCurrency(extra) })}
              </div>
            )}
            <div className={`${styles.free} ${plan.free < 0 ? styles.freeNegative : ""}`}>{t("allocation.freeAmount", { amount: formatCurrency(plan.free) })}</div>
            <p className="text-body-secondary mb-2" style={{ fontSize: 12 }}>
              {t("allocation.dividesThis")}
            </p>

            {/* A month that is not like the others, without rewriting the plan
                and then having to remember to put it back. */}
            <div className={styles.extra}>
              <span style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{t("allocation.extraThisMonth")}</span>
              <Input
                bsSize="sm"
                value={storedExtra?.label ?? ""}
                onChange={(e) => setExtraLabel(e.target.value)}
                placeholder={t("allocation.extraPlaceholder")}
                aria-label={t("allocation.extraWhatFor")}
                style={{ flex: 1, minWidth: 120 }}
              />
              {/* Grouped so the clear button wraps with the figure it clears,
                  rather than dropping onto a line of its own. */}
              <span className="d-flex align-items-center gap-1">
                <Input
                  bsSize="sm"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={extraDraft ?? String(storedExtra?.amount ?? "")}
                  onChange={(e) => {
                    setExtraDraft(e.target.value);
                    setExtraAmount(parseFloat(e.target.value) || 0);
                  }}
                  onBlur={() => setExtraDraft(null)}
                  placeholder="0"
                  aria-label={t("allocation.extraAmount")}
                  style={{ width: 84, textAlign: "right" }}
                />
                {extra > 0 && (
                  <button type="button" className={styles.iconBtn} onClick={() => setExtra(null)} aria-label={t("allocation.clearExtra")} title={t("allocation.clearExtra")}>
                    <FiX size={15} />
                  </button>
                )}
              </span>
            </div>
            <p className="text-body-secondary mb-3" style={{ fontSize: 11 }}>
              {t("allocation.extraNote")}
            </p>

            {plan.free <= 0 ? (
              <Alert color="danger" className="small mb-0">
                {t("allocation.nothingFree")}
              </Alert>
            ) : (
              <>
                <div className={styles.bar} role="img" aria-label={t("allocation.barLabel")}>
                  {plan.buckets.map((bucket, i) => {
                    const width = Math.max(0, bucket.share) * 100;
                    // A label in a sliver is a smear. The rows below carry the
                    // names, tied back by the colour of the dot.
                    return (
                      <div key={bucket.id} className={styles.slice} style={{ width: `${width}%`, background: seriesColor(i), color: "#fff" }}>
                        {width >= 14 ? bucket.label : ""}
                      </div>
                    );
                  })}
                  {plan.unallocated > 0 && <div className={`${styles.slice} ${styles.sliceFree}`} style={{ width: `${(plan.unallocated / plan.free) * 100}%` }} />}
                </div>

                <div className={`${styles.remainder} ${remainderTone}`}>
                  <span>
                    {plan.unallocated > 0.005
                      ? t("allocation.remainderOpen", { amount: formatCurrency(plan.unallocated) })
                      : plan.unallocated < -0.005
                        ? t("allocation.remainderOver", { amount: formatCurrency(Math.abs(plan.unallocated)) })
                        : t("allocation.remainderDone")}
                  </span>
                  {Math.abs(plan.unallocated) > 0.005 && plan.buckets.length > 0 && (
                    <Button color="secondary" outline size="sm" style={{ fontSize: 11.5 }} onClick={() => giveRemainderTo(plan.buckets[0].id)}>
                      {t("allocation.giveTo", { name: plan.buckets[0].label })}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Buckets ── */}
          {plan.free > 0 && (
            <div className={styles.card}>
              {plan.buckets.length === 0 ? (
                <>
                  <p className="mb-2" style={{ fontSize: 13 }}>
                    {t("allocation.startFrom")}
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    {PRESETS.map((preset) => (
                      <Button key={preset.id} color="secondary" outline size="sm" onClick={() => choosePreset(preset.id)}>
                        {t(`allocation.presets.${preset.id}`)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-body-secondary mb-0 mt-2" style={{ fontSize: 11.5 }}>
                    {t("allocation.presetsNote")}
                  </p>
                </>
              ) : (
                <>
                  {plan.buckets.map((bucket, i) => {
                    return (
                      <div key={bucket.id} className={styles.row}>
                        <div className={styles.rowHead}>
                          <span className={styles.dot} style={{ background: seriesColor(i) }} aria-hidden />
                          <input className={styles.name} value={bucket.label} onChange={(e) => rename(bucket.id, e.target.value)} aria-label={t("allocation.bucketName")} />

                          <Input
                            bsSize="sm"
                            type="number"
                            min={0}
                            inputMode="decimal"
                            className={styles.amount}
                            value={drafts[bucket.id] ?? String(bucket.amount)}
                            onChange={(e) => {
                              const typed = parseFloat(e.target.value) || 0;
                              const ceiling = bucketCeiling(lines, bucket.id, plan.free);
                              // Snap the box to the ceiling as it is hit. Letting it
                              // read 5000 while 420 was stored is the app agreeing
                              // to money that is not there.
                              setDrafts((d) => ({ ...d, [bucket.id]: typed > ceiling ? String(ceiling) : e.target.value }));
                              setAmount(bucket.id, typed);
                            }}
                            onBlur={() => clearDraft(bucket.id)}
                            aria-label={t("allocation.bucketAmount")}
                          />
                          <span className={styles.pct}>{Math.round(bucket.share * 100)}%</span>

                          <button type="button" className={styles.iconBtn} onClick={() => remove(bucket.id)} aria-label={t("common.delete")} title={t("common.delete")}>
                            <FiX size={15} />
                          </button>
                        </div>

                        <div className={styles.rowBody}>
                          <input
                            className={styles.slider}
                            type="range"
                            min={0}
                            max={Math.round(plan.free)}
                            step={1}
                            value={Math.round(bucket.amount)}
                            onChange={(e) => setAmount(bucket.id, Number(e.target.value))}
                            aria-label={t("allocation.bucketShare", { name: bucket.label })}
                          />
                          <span className={styles.perDay}>{t("allocation.perDay", { amount: formatCurrency(bucket.perDay) })}</span>
                        </div>
                      </div>
                    );
                  })}

                  <button type="button" className={styles.addBucket} onClick={addBucket}>
                    <FiPlus size={14} /> {t("allocation.addBucket")}
                  </button>

                  <div className="d-flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    <span className="text-body-secondary align-self-center" style={{ fontSize: 11.5 }}>
                      {t("allocation.startOver")}
                    </span>
                    {PRESETS.map((preset) => (
                      <Button key={preset.id} color="secondary" outline size="sm" style={{ fontSize: 11.5 }} onClick={() => choosePreset(preset.id)}>
                        {t(`allocation.presets.${preset.id}`)}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <p className="text-body-secondary" style={{ fontSize: 11.5 }}>
            {t("allocation.sharedWithPlanner")}
          </p>
        </>
      )}
    </Container>
  );
}

export default AllocationPage;
