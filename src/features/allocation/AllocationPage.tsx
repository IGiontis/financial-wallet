import { useEffect, useMemo, useState } from "react";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { Alert, Button, Container, Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiPlus, FiTag, FiX } from "react-icons/fi";

import { SkeletonCard, SkeletonPageHeader } from "../../shared/components/Skeletons";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { useInvestmentGoals } from "../budget/useInvestments";
import { useCategories, useTransactions } from "../transactions/hooks/useTransactions";
import { seriesColor } from "../analytics/components/chartTheme";
import { categoryLabel } from "../../shared/utils/categories";
import type { OneOff } from "../plannerPage/plannerUtils";
import {
  allocate,
  assignRemainder,
  bucketActual,
  bucketCeiling,
  committedMonthly,
  EMERGENCY_MONTHS,
  emergencyTarget,
  extraFor,
  extraPayForMonth,
  monthKey,
  nextRollover,
  seedFromHistory,
  setBucketAmount,
  spentByCategory,
  type Bucket,
  type ExtraPayMode,
  type ExtraThisMonth,
  type RolloverState,
} from "./allocationUtils";
import CategoryLinkModal from "./CategoryLinkModal";
import styles from "./css/Allocation.module.css";

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * What to do with what is left — and whether last month's answer held.
 *
 * The planner answers "do I get through the month?": a projection, with a
 * verdict. This answers a different question. Of the money genuinely free once
 * the unavoidable is paid, how should it be divided — and, the part that makes
 * it a budget rather than a wish list, how is that division actually going?
 *
 * Every bucket names the categories it pays for, so the page can put the plan
 * and the ledger side by side. Without that link the two were connected by
 * nothing but a label, and a plan that is never compared with what happened is
 * one you rewrite from scratch every month.
 */
export function AllocationPage() {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrencyConverter();

  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: goals = [], isLoading: goalsLoading } = useInvestmentGoals();
  const { data: debts = [] } = useDebts();
  const { data: transactions = [], isLoading: txLoading } = useTransactions();
  const { data: categories = [] } = useCategories();

  // Reads the planner's pay figures; writes nothing the planner reads. Dragging
  // a slider here to see how a month could go should not quietly rewrite the
  // plan relied on there.
  const [storedSalary] = useLocalStorage("planner-salary", { amount: "", day: "" });
  const [storedOneOffs] = useLocalStorage<OneOff[]>("planner-oneoffs", []);
  const [storedLines, setLines] = useLocalStorage<Bucket[]>("allocation-buckets", []);
  const [storedExtra, setExtra] = useLocalStorage<ExtraThisMonth | null>("allocation-extra", null);
  const [payMode, setPayMode] = useLocalStorage<ExtraPayMode>("allocation-pay-mode", "when");
  const [storedRollover, setRollover] = useLocalStorage<RolloverState | null>("allocation-rollover", null);

  const [now] = useState(() => new Date());
  const [linking, setLinking] = useState<string | null>(null);

  const lines = useMemo(
    () => (Array.isArray(storedLines) ? storedLines.filter((l): l is Bucket => !!l && typeof l.id === "string" && Number.isFinite(l.amount)) : []),
    [storedLines],
  );
  const oneOffs = useMemo(() => (Array.isArray(storedOneOffs) ? storedOneOffs.filter((o) => !!o && typeof o.date === "string" && Number.isFinite(o.amount)) : []), [storedOneOffs]);

  const salary = parseFloat(String(storedSalary?.amount ?? "")) || 0;
  const extraPay = useMemo(() => extraPayForMonth(oneOffs, payMode === "spread" ? "spread" : "when", now), [oneOffs, payMode, now]);
  const income = salary + extraPay;

  const committed = useMemo(() => committedMonthly(bills, goals, debts, now), [bills, goals, debts, now]);
  const extra = useMemo(() => extraFor(storedExtra, now), [storedExtra, now]);
  const plan = useMemo(() => allocate(income, committed, lines, extra), [income, committed, lines, extra]);

  // ── This month against the plan ───────────────────────────────────────────

  const spent = useMemo(() => spentByCategory(transactions, startOfMonth(now), endOfMonth(now)), [transactions, now]);
  const thisMonth = monthKey(now);
  const carried = storedRollover?.month === thisMonth ? (storedRollover.byBucket ?? {}) : {};

  // Rolled once, on the first visit of a new month. Only from the month
  // immediately before: after a gap there is no chain to continue, and
  // reconstructing one from a ledger that may have changed since would be
  // inventing a balance rather than remembering it.
  useEffect(() => {
    if (txLoading || lines.length === 0) return;
    if (storedRollover?.month === thisMonth) return;

    const previous = monthKey(subMonths(now, 1));
    const carriedIn = storedRollover?.month === previous ? (storedRollover.byBucket ?? {}) : {};
    const lastMonth = spentByCategory(transactions, startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1)));

    setRollover({ month: thisMonth, byBucket: storedRollover ? nextRollover(lines, carriedIn, lastMonth) : {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txLoading, thisMonth, storedRollover?.month, lines.length]);

  // ── Cushion ───────────────────────────────────────────────────────────────

  const cushion = useMemo(() => {
    const target = emergencyTarget(committed);
    // Whatever is being saved into counts toward it. Naming one goal "the"
    // emergency fund would need a field the goal model does not have, and
    // guessing from its name would be worse than adding the figures up.
    const saved = goals.filter((g) => g.isActive && !g.isCompleted).reduce((sum, g) => sum + (g.totalSaved ?? 0), 0);
    return { target, saved, share: target > 0 ? Math.min(saved / target, 1) : 0 };
  }, [committed, goals]);

  // ── Editing ───────────────────────────────────────────────────────────────

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
  const linkCategories = (id: string, categoryIds: string[]) => setLines(lines.map((l) => (l.id === id ? { ...l, categoryIds } : l)));
  const setExtraAmount = (amount: number) => setExtra({ month: thisMonth, label: storedExtra?.label ?? "", amount });
  const setExtraLabel = (label: string) => setExtra({ month: thisMonth, label, amount: storedExtra?.amount ?? 0 });
  const addBucket = () => setLines([...lines, { id: newId(), label: t("allocation.newBucket"), amount: 0, kind: "expense" }]);
  const giveRemainderTo = (id: string) => setLines(assignRemainder(lines, id, plan.unallocated));

  const seed = () => {
    const kept = lines.filter((l) => l.kind === "income");
    setLines([...kept, ...seedFromHistory(transactions, categories, newId, now)]);
  };

  const nameFor = (id: string) => {
    const category = categories.find((c) => c.id === id);
    return category ? categoryLabel(category.name, t) : t("analytics.unknownCategory");
  };

  if (billsLoading || goalsLoading || txLoading) {
    return (
      <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 820 }}>
        <SkeletonPageHeader />
        <SkeletonCard />
      </Container>
    );
  }

  const remainderTone = plan.unallocated > 0.005 ? styles.remainderOpen : plan.unallocated < -0.005 ? styles.remainderOver : styles.remainderDone;
  const linkingBucket = lines.find((l) => l.id === linking);
  const canSeed = transactions.length > 0;

  return (
    <Container fluid className="py-3 py-lg-4" style={{ maxWidth: 820 }}>
      <div className="mb-3">
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("allocation.title")}</h1>
        <p className="small text-body-secondary mb-0">{t("allocation.subtitle")}</p>
      </div>

      {salary <= 0 ? (
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
            <div className={`${styles.free} ${plan.free < 0 ? styles.freeNegative : ""}`}>{t("allocation.availableAmount", { amount: formatCurrency(plan.free) })}</div>
            <p className="text-body-secondary mb-2" style={{ fontSize: 12 }}>
              {t("allocation.dividesThis")}
            </p>

            {/* Pay beyond the twelve. Left out entirely before, which understated
                a Greek year by two salaries. */}
            {oneOffs.length > 0 && (
              <div className={styles.payMode}>
                <span>{t("allocation.extraPay", { amount: formatCurrency(extraPay) })}</span>
                <Button color="secondary" outline size="sm" style={{ fontSize: 11.5 }} onClick={() => setPayMode(payMode === "spread" ? "when" : "spread")}>
                  {t(payMode === "spread" ? "allocation.paySpread" : "allocation.payWhen")}
                </Button>
              </div>
            )}

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
                    {canSeed ? t("allocation.seedPrompt") : t("allocation.seedNoHistory")}
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    {canSeed && (
                      <Button color="primary" size="sm" onClick={seed}>
                        {t("allocation.seedAction")}
                      </Button>
                    )}
                    <Button color="secondary" outline size="sm" onClick={addBucket}>
                      {t("allocation.addBucket")}
                    </Button>
                  </div>
                  <p className="text-body-secondary mb-0 mt-2" style={{ fontSize: 11.5 }}>
                    {t("allocation.seedNote")}
                  </p>
                </>
              ) : (
                <>
                  {plan.buckets.map((bucket, i) => {
                    const source = lines.find((l) => l.id === bucket.id) ?? bucket;
                    const rollover = carried[bucket.id] ?? 0;
                    const actual = bucketActual(source, spent, rollover);
                    const budget = bucket.amount + rollover;
                    const pct = Math.min(actual.used, 1) * 100;
                    const tone = actual.left < 0 ? styles.fillOver : actual.used >= 0.85 ? styles.fillClose : "";
                    const links = source.categoryIds ?? [];

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
                        </div>

                        {/* The plan, and what the month actually did with it. */}
                        <div className={styles.track} aria-hidden>
                          <div className={`${styles.fill} ${tone}`} style={{ width: `${actual.unmeasured ? 0 : pct}%` }} />
                        </div>

                        <div className={styles.actual}>
                          <span className={actual.left < 0 ? styles.actualOver : undefined}>
                            {actual.unmeasured
                              ? t("allocation.unmeasured")
                              : actual.left < 0
                                ? t("allocation.spentOver", { spent: formatCurrency(actual.spent), budget: formatCurrency(budget), over: formatCurrency(Math.abs(actual.left)) })
                                : t("allocation.spentOf", { spent: formatCurrency(actual.spent), budget: formatCurrency(budget), left: formatCurrency(actual.left) })}
                          </span>
                          {rollover > 0 && <span className={styles.carried}>{t("allocation.carried", { amount: formatCurrency(rollover) })}</span>}
                        </div>

                        <div className={styles.links}>
                          <button type="button" className={`${styles.linkBtn} ${links.length > 0 ? styles.linked : ""}`} onClick={() => setLinking(bucket.id)}>
                            <FiTag size={12} aria-hidden />
                            {links.length === 0 ? t("allocation.linkNone") : links.map(nameFor).join(", ")}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button type="button" className={styles.addBucket} onClick={addBucket}>
                    <FiPlus size={14} /> {t("allocation.addBucket")}
                  </button>

                  {canSeed && (
                    <div className="d-flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                      <span className="text-body-secondary align-self-center" style={{ fontSize: 11.5 }}>
                        {t("allocation.startOver")}
                      </span>
                      <Button color="secondary" outline size="sm" style={{ fontSize: 11.5 }} onClick={seed}>
                        {t("allocation.seedAction")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Cushion ── */}
          {committed.total > 0 && (
            <div className={styles.card}>
              <div className={styles.cushionHead}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t("allocation.cushion")}</span>
                <span className={styles.cushionAmount}>{t("allocation.cushionOf", { saved: formatCurrency(cushion.saved), target: formatCurrency(cushion.target) })}</span>
              </div>
              <div className={styles.track} aria-hidden>
                <div className={styles.fill} style={{ width: `${cushion.share * 100}%` }} />
              </div>
              <p className="text-body-secondary mb-0" style={{ fontSize: 11.5 }}>
                {t("allocation.cushionNote", { months: EMERGENCY_MONTHS, amount: formatCurrency(committed.total) })}
              </p>
            </div>
          )}

          <p className="text-body-secondary" style={{ fontSize: 11.5 }}>
            {t("allocation.sharedWithPlanner")}
          </p>
        </>
      )}

      {linkingBucket && (
        <CategoryLinkModal
          bucket={linkingBucket}
          categories={categories}
          others={lines.filter((l) => l.id !== linkingBucket.id)}
          onChange={(ids) => linkCategories(linkingBucket.id, ids)}
          onClose={() => setLinking(null)}
        />
      )}
    </Container>
  );
}

export default AllocationPage;
