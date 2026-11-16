import { useContext, useMemo, useState } from "react";
import { useSavedFlash } from "../../shared/feedback/saveFeedback";
import { UNSAFE_LocationContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../../shared/components/Skeletons";
import { FiX } from "react-icons/fi";
import { Button } from "reactstrap";

import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useDebts, useHealDebtCash } from "./useDebts";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { debtProgress, debtTotals, debtsByPerson } from "./debtsUtils";
import { useNarrowScreen } from "../../shared/hooks/useNarrowScreen";
import PersonDebtsModal from "./PersonDebtsModal";
import { DebtOrder } from "./DebtOrder";
import AddDebtModal from "./AddDebtModal";
import styles from "./css/DebtsPage.module.css";
import { PageShell } from "../../shared/components/PageShell";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { AddHeader } from "../../shared/components/AddButton";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import { PageWaiting } from "../../shared/components/PageWaiting";

/**
 * Who you owe, and who owes you.
 *
 * Kept out of transactions on purpose: borrowed money is not income and
 * repaying is not spending, so letting either into the ledger would distort
 * every average on the Analytics screen. The Planner reads the one half that
 * genuinely has to be found from somewhere — what you owe.
 */
/** A laptop and up, once the menu has taken its share: room for a list and a panel side by side. */
const WIDE_QUERY = "(min-width: 1200px)";

export function DebtsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();

  const debtsQuery = useDebts();
  const { data: debts = [] } = debtsQuery;
  // The skeleton for a few seconds at most, then the page — see `usePageLoad`.
  const load = usePageLoad(noAnswerYet(debtsQuery));
  // The person whose debt was just saved (made, edited, a repayment) lights
  // once the form has gone — `celebrateSave({ collection: "debts", id })`.
  const debtFlash = useSavedFlash("debts", useMemo(() => debts.map((d) => d.id), [debts]));
  // Money a lost signal left out of step with its debt, put right on arrival.
  useHealDebtCash(debtsQuery, useTransactions());
  // From a laptop up, the person is a panel beside the list rather than a dialog
  // over it, and one is always in it — the list is its own navigation.
  const wide = useNarrowScreen(WIDE_QUERY);
  // A link from elsewhere («Αλλάζει από τα Δάνεια» on a transaction) arrives
  // with the person to open, in the route's state rather than the address.
  // Read from the context, not useLocation(), which throws outside a router.
  const arrivedFor = (useContext(UNSAFE_LocationContext)?.location?.state as { person?: string } | null | undefined)?.person;
  const [openPerson, setOpenPerson] = useState<string | null>(arrivedFor ?? null);
  const [adding, setAdding] = useState(false);
  // The floating «+» adds a debt or a loan here.
  usePageAdd(t("debts.add"), () => setAdding(true));
  // The two tiles are the list's filter: «Χρωστάς» shows only those you owe,
  // «Σου χρωστάνε» only those who owe you. They used to be figures to read and
  // nothing else, which a tile that looks pressable makes a dead end.
  const [side, setSide] = useState<"owe" | "owed" | null>(null);

  const people = useMemo(() => debtsByPerson(debts), [debts]);
  const totals = useMemo(() => debtTotals(people), [people]);
  const shown = side === "owe" ? people.filter((p) => p.owedByMe > 0) : side === "owed" ? people.filter((p) => p.owedToMe > 0) : people;
  // Wide: the one chosen, or the first until one is. Narrow: only what was tapped.
  const person = shown.find((p) => p.person === openPerson) ?? (wide ? shown[0] : undefined);
  const toggleSide = (next: "owe" | "owed") => setSide(side === next ? null : next);
  const netTone = totals.net > 0 ? "var(--color-income)" : totals.net < 0 ? "var(--color-expense)" : undefined;

  // The shape of what is coming, rather than a wheel. The whole page used to be
  // replaced by the spinner — heading, "add a loan" button and all — so there was
  // a moment where the screen offered nothing to do and nothing to read.
  if (load === "loading") {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <SkeletonStats count={3} />
        <SkeletonRows count={4} />
      </PageShell>
    );
  }
  // Still nothing after the skeleton's time: the add, and a quiet line — not «no debts», which
  // nobody has checked yet. The list replaces it the moment it arrives.
  if (load === "waiting") {
    return (
      <PageShell>
        <AddHeader label={t("debts.add")} onAdd={() => setAdding(true)} title={t("debts.title")} subtitle={t("debts.subtitle")} />
        <PageWaiting />
        {adding && <AddDebtModal knownPeople={[]} onClose={() => setAdding(false)} />}
      </PageShell>
    );
  }

  /** Spelled out rather than signed — see the CSS note on `.personBalance`. */
  const balanceLabel = (owedByMe: number, owedToMe: number) => {
    if (owedByMe > 0 && owedToMe > 0) return { text: t("debts.bothWays", { out: formatCurrency(owedByMe), in: formatCurrency(owedToMe) }), tone: "var(--color-expense)" };
    if (owedByMe > 0) return { text: t("debts.youOweAmount", { amount: formatCurrency(owedByMe) }), tone: "var(--color-expense)" };
    if (owedToMe > 0) return { text: t("debts.owesYouAmount", { amount: formatCurrency(owedToMe) }), tone: "var(--color-income)" };
    return { text: t("debts.settledUp"), tone: undefined };
  };

  return (
    <PageShell>
      <AddHeader label={t("debts.add")} onAdd={() => setAdding(true)} title={t("debts.title")} subtitle={t("debts.subtitle")} />

      {/* Inline rather than instead of the page: failing to read is no reason to
          take away the button that writes, and the first thing a new collection
          does is fail here until its rules are published. The code is shown
          because "permission-denied" and "unavailable" need different fixes. */}

      <div className={styles.totals}>
        <button
          type="button"
          className={`${styles.total} tone-tile tone-tile-expense ${side === "owe" ? styles.totalOn : ""}`}
          aria-pressed={side === "owe"}
          title={t("debts.filterHint")}
          onClick={() => toggleSide("owe")}
        >
          <span className={styles.totalLabel}>{t("debts.youOwe")}</span>
          <span className={styles.totalAmount}>{formatCurrency(totals.owedByMe)}</span>
        </button>
        <button
          type="button"
          className={`${styles.total} tone-tile tone-tile-income ${side === "owed" ? styles.totalOn : ""}`}
          aria-pressed={side === "owed"}
          title={t("debts.filterHint")}
          onClick={() => toggleSide("owed")}
        >
          <span className={styles.totalLabel}>{t("debts.owedToYou")}</span>
          <span className={styles.totalAmount}>{formatCurrency(totals.owedToMe)}</span>
        </button>

        {/* Signed, because the sign is the answer: whether the pair above nets
            out for you or against you is the one thing the two tiles make you
            work out yourself. Zero takes no sign and no colour — "+€0.00" reads
            as a tiny win rather than as nothing owed either way. */}
        <div className={styles.net}>
          <span className={styles.netLabel}>{t("debts.net")}</span>
          <span className="d-flex align-items-baseline gap-2">
            <span className={styles.netAmount} style={{ color: netTone }}>
              {totals.net === 0 ? formatCurrency(0) : `${totals.net > 0 ? "+" : "−"}${formatCurrency(Math.abs(totals.net))}`}
            </span>
            <span className={styles.netNote}>{t(totals.net > 0 ? "debts.netAhead" : totals.net < 0 ? "debts.netBehind" : "debts.netEven")}</span>
          </span>
        </div>
      </div>

      {/* Right under the tiles, where the eye is after tapping one: what the
          list now holds, and the way back to everyone. Inside the list it sat
          below the fold on a phone, and tapping the same tile again to undo it
          is something nobody guesses. */}
      {side && (
        <div className={`${styles.filterLine} mb-3`} role="status">
          <span>{t(side === "owe" ? "debts.filterOwe" : "debts.filterOwed")}</span>
          <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1 text-nowrap" onClick={() => setSide(null)}>
            <FiX size={14} aria-hidden /> {t("debts.filterShowAll")}
          </button>
        </div>
      )}

      <div className={wide && shown.length > 0 ? styles.split : undefined}>
        <div className={`${styles.card} ${wide ? styles.listCard : ""} p-3 p-lg-4`} data-tour="debts-people">
          {shown.length === 0 && !side ? (
            // Nothing at all yet: an invitation with the page's add (rule 7), as Bills and Goals have.
            <div className="text-center text-body-secondary py-4">
              <p className="mb-3" style={{ fontSize: "var(--fs-text)" }}>
                {t("debts.empty")}
              </p>
              <Button color="primary" onClick={() => setAdding(true)}>
                + {t("debts.add")}
              </Button>
            </div>
          ) : shown.length === 0 ? (
            <p className="text-body-secondary mb-0" style={{ fontSize: "var(--fs-text)" }}>
              {t(side === "owe" ? "debts.filterEmptyOwe" : "debts.filterEmptyOwed")}
            </p>
          ) : (
            shown.map((p) => {
              const balance = balanceLabel(p.owedByMe, p.owedToMe);
              const selected = wide && person?.person === p.person;
              // How much of everything with them has come off, from the same split
              // as the sheet: so the list says it before anything is opened.
              const progress = p.debts.map((d) => debtProgress(d));
              const started = progress.reduce((sum, x) => sum + x.started, 0);
              const cleared = started > 0 ? Math.min(Math.round((progress.reduce((sum, x) => sum + x.principal, 0) / started) * 100), 100) : 0;
              return (
                <button key={p.person} type="button" className={`${styles.person} ${selected ? styles.personOn : ""} ${p.debts.map((d) => debtFlash(d.id)).find(Boolean) ?? ""}`} aria-pressed={wide ? !!selected : undefined} onClick={() => setOpenPerson(p.person)}>
                  <span className={styles.personName}>{p.person}</span>
                  <span className={styles.personCount}>{t("debts.loanCount", { count: p.openCount })}</span>
                  <span className={`${styles.personBalance} ${p.openCount === 0 ? styles.settled : ""}`} style={{ color: balance.tone }}>
                    {balance.text}
                  </span>
                  {wide && started > 0 && (
                    <span className={styles.personBar} aria-hidden>
                      <span style={{ width: `${cleared}%` }} />
                      <span className={styles.personBarPct}>{cleared}%</span>
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {wide && person && (
          <PersonDebtsModal key={person.person} inline person={person} knownPeople={people.map((p) => p.person)} formatCurrency={formatCurrency} locale={lang} onClose={() => setOpenPerson(null)} />
        )}
      </div>

      {/* Which loan to put spare money against first — only with a loan that charges interest. */}
      <DebtOrder debts={debts} formatCurrency={formatCurrency} />

      {!wide && person && (
        <PersonDebtsModal person={person} knownPeople={people.map((p) => p.person)} formatCurrency={formatCurrency} locale={lang} onClose={() => setOpenPerson(null)} />
      )}
      {adding && <AddDebtModal knownPeople={people.map((p) => p.person)} onClose={() => setAdding(false)} />}
    </PageShell>
  );
}

export default DebtsPage;
