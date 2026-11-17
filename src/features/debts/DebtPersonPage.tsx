import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiChevronLeft } from "react-icons/fi";
import { PageShell } from "../../shared/components/PageShell";
import { AddHeader } from "../../shared/components/AddButton";
import { PageTabs } from "../../shared/components/PageTabs";
import { PageWaiting } from "../../shared/components/PageWaiting";
import { DensitySwitch } from "../../shared/components/DensitySwitch";
import { SkeletonPageHeader, SkeletonRows } from "../../shared/components/Skeletons";
import { useSavedFlash } from "../../shared/feedback/saveFeedback";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useDensity } from "../../shared/hooks/useDensity";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import { usePageTab } from "../../shared/hooks/usePageTab";
import { pageTabIds } from "../../shared/utils/pageTabIds";
import { useDebts } from "./useDebts";
import { debtsByPerson, personProgress } from "./debtsUtils";
import { personKey, personPath } from "./debtSides";
import { DebtCard, ProgressPanel } from "./DebtCard";
import { DebtActionsSheet } from "./DebtActionsSheet";
import AddDebtModal from "./AddDebtModal";
import RepaymentWizard from "./RepaymentWizard";
import styles from "./css/DebtsPage.module.css";
import type { DebtPerson, DebtWithStatus } from "../../shared/types/IndexTypes";

const TABS = ["open", "settled"] as const;
const TABS_BASE = "debt-person";

/** The page's one dialog at a time: a repayment, «Ενέργειες» (its forms steps inside it), or a new loan. */
type Sheet = { kind: "repay"; debtId: string; amount: number } | { kind: "actions"; debtId: string } | { kind: "add" } | null;

/**
 * One person — or one bank loan — on a page of its own (owner, 2026-11-17:
 * «he gets lost inside» the old sheet). `/debts/person/:key` is everything
 * with a person (`key` = the name's compare key, `textKey`); `/debts/loan/:id`
 * one bank loan.
 *
 * «Χρέη › Δέσποινα» with the way back, the «+» for another loan with them, then
 * «Ενεργά · Εξοφλημένα» (`?tab=`) — a loan's page has no tabs, it is one debt —
 * and the shared «Απλό · Κανονικό · Αναλυτικό» (remembered on the device).
 * Each debt is a `DebtCard` with «+ Επιστροφή» / «Ήρθε» and «Ενέργειες»; the
 * page opens one dialog at a time and nothing on top of it.
 *
 * No read of its own: the debts list the device already holds (`useDebts`).
 */
export function DebtPersonPage() {
  const { t } = useTranslation();
  const { key, id } = useParams();
  const debtsQuery = useDebts();
  const { data: debts = [] } = debtsQuery;
  const load = usePageLoad(noAnswerYet(debtsQuery));
  const people = useMemo(() => debtsByPerson(debts), [debts]);
  const loan = id ? debts.find((d) => d.id === id) : undefined;
  const person = id ? (loan ? people.find((p) => p.debts.some((d) => d.id === loan.id)) : undefined) : people.find((p) => personKey(p.person) === key);

  if (load === "loading") {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <SkeletonRows count={3} />
      </PageShell>
    );
  }
  if (load === "waiting") {
    return (
      <PageShell>
        <div className="d-flex align-items-center gap-2 mb-3">
          <h1 className="h5 fw-semibold text-body-emphasis mb-0 flex-grow-1">{t("debts.title")}</h1>
          <BackToDebts />
        </div>
        <PageWaiting />
      </PageShell>
    );
  }
  // A key that matches none of this user's debts — another account's link, or
  // someone with nothing left: said plainly, with the way back. Never an error.
  if (!person || (id && !loan)) {
    return (
      <PageShell>
        <div className="d-flex align-items-center gap-2 mb-3">
          <h1 className="h5 fw-semibold text-body-emphasis mb-0 flex-grow-1">{t("debts.title")}</h1>
          <BackToDebts />
        </div>
        <div className={`${styles.card} p-3 p-lg-4`}>
          <p className={styles.sideEmpty}>{t("debts.personNotFound")}</p>
          <Link to="/debts" className="d-inline-block mt-2 fw-semibold">
            {t("debts.personNotFoundBack")}
          </Link>
        </div>
      </PageShell>
    );
  }
  return <PersonDebts key={id ?? person.person} person={person} loan={loan} knownPeople={people.map((p) => p.person)} />;
}

function BackToDebts() {
  const { t } = useTranslation();
  return (
    <Link to="/debts" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1 flex-shrink-0 text-nowrap">
      <FiChevronLeft size={14} aria-hidden /> {t("common.back")}
    </Link>
  );
}

/** The page itself, once it is known whose it is. */
function PersonDebts({ person, loan, knownPeople }: { person: DebtPerson; loan?: DebtWithStatus; knownPeople: string[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const navigate = useNavigate();
  const { format: formatCurrency } = useCurrencyConverter();
  const [tab, setTab] = usePageTab(TABS, "open", "debts:person:tab");
  const [density, setDensity] = useDensity("debts-person");
  const [sheet, setSheet] = useState<Sheet>(null);
  usePageAdd(t("debts.newLoanShort"), () => setSheet({ kind: "add" }));
  const id = loan?.id;
  // The debts this page is about: the loan alone, or all of the person's.
  const scope = useMemo(() => (loan ? [loan] : person.debts), [loan, person]);
  const flash = useSavedFlash("debts", useMemo(() => scope.map((d) => d.id), [scope]));
  const open = scope.filter((d) => !d.isSettled);
  const settled = scope.filter((d) => d.isSettled);
  const back = <BackToDebts />;

  const title = loan ? `${person.person} · ${loan.label || t(loan.direction === "owed_by_me" ? "debts.iBorrowed" : "debts.iLent")}` : person.person;
  const owedByMe = id ? (loan && !loan.isSettled && loan.direction === "owed_by_me" ? loan.remaining : 0) : person.owedByMe;
  const owedToMe = id ? (loan && !loan.isSettled && loan.direction === "owed_to_me" ? loan.remaining : 0) : person.owedToMe;
  const subtitle =
    owedByMe > 0 && owedToMe > 0
      ? t("debts.bothWays", { out: formatCurrency(owedByMe), in: formatCurrency(owedToMe) })
      : owedByMe > 0
        ? t("debts.youOweAmount", { amount: formatCurrency(owedByMe) })
        : owedToMe > 0
          ? t("debts.owesYouAmount", { amount: formatCurrency(owedToMe) })
          : t("debts.settledUp");
  const shown = id ? scope : tab === "open" ? open : settled;
  const sheetDebt = sheet && sheet.kind !== "add" ? scope.find((d) => d.id === sheet.debtId) : undefined;

  const list = (
    <>
      <div className={styles.personBar}>
        <DensitySwitch value={density} onChange={setDensity} />
      </div>
      {/* «Αναλυτικό» with several: the totals with them first, each direction on its own. */}
      {density === "detailed" && shown.length > 1 && (
        <div className={styles.personTotal}>
          {personProgress(shown).map((total) => (
            <ProgressPanel
              key={total.direction}
              progress={total.progress}
              borrowed={total.direction === "owed_by_me"}
              formatCurrency={formatCurrency}
              title={t(total.direction === "owed_by_me" ? "debts.totalBorrowed" : "debts.totalLent", { count: total.count })}
            />
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <div className={`${styles.card} p-3 p-lg-4`}>
          <p className={styles.sideEmpty}>{t(tab === "open" ? "debts.personNoOpen" : "debts.personNoSettled", { name: person.person })}</p>
        </div>
      ) : (
        <div className={styles.debtCards}>
          {shown.map((d) => (
            <DebtCard
              key={d.id}
              debt={d}
              density={density}
              formatCurrency={formatCurrency}
              locale={lang}
              className={flash(d.id)}
              onRecord={(amount) => setSheet({ kind: "repay", debtId: d.id, amount })}
              onActions={() => setSheet({ kind: "actions", debtId: d.id })}
            />
          ))}
        </div>
      )}
    </>
  );

  const ids = pageTabIds(TABS_BASE, tab);
  return (
    <PageShell>
      <div className="d-flex align-items-center gap-2 mb-3">
        <AddHeader
          className="flex-grow-1"
          label={t("debts.newLoanShort")}
          onAdd={() => setSheet({ kind: "add" })}
          title={
            <>
              <Link to="/debts" className={styles.crumb}>
                {t("debts.crumb")}
              </Link>
              <span aria-hidden> › </span>
              {title}
            </>
          }
          subtitle={subtitle}
        />
        {back}
      </div>

      {id ? (
        <div className={styles.panel}>{list}</div>
      ) : (
        <>
          <PageTabs
            base={TABS_BASE}
            label={person.person}
            tabs={[
              { id: "open", label: t("debts.personOpen", { count: open.length }) },
              { id: "settled", label: t("debts.personSettled", { count: settled.length }) },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} tabIndex={0} className={styles.panel}>
            {list}
          </div>
        </>
      )}

      {sheet?.kind === "repay" && sheetDebt && <RepaymentWizard debt={sheetDebt} suggested={sheet.amount} formatCurrency={formatCurrency} onClose={() => setSheet(null)} />}
      {sheet?.kind === "actions" && sheetDebt && (
        <DebtActionsSheet
          debt={sheetDebt}
          knownPeople={knownPeople}
          formatCurrency={formatCurrency}
          onClose={() => setSheet(null)}
          // Saved under another name: that person's page, not an empty one.
          // The last debt here gone: the list, not an empty page.
          onDeleted={() => scope.length <= 1 && navigate("/debts", { replace: true })}
          onRenamed={(name) => navigate(id ? `/debts/loan/${encodeURIComponent(id)}` : personPath(name), { replace: true })}
        />
      )}
      {sheet?.kind === "add" && <AddDebtModal defaultPerson={person.person} knownPeople={knownPeople} onClose={() => setSheet(null)} />}
    </PageShell>
  );
}

export default DebtPersonPage;
