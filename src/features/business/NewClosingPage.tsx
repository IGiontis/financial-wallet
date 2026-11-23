import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageShell } from "../../shared/components/PageShell";
import { PageHeader } from "../../shared/components/PageHeader";
import { PageWaiting } from "../../shared/components/PageWaiting";
import { SkeletonRows } from "../../shared/components/Skeletons";
import { useAccessState } from "../../shared/hooks/useHasAccess";
import { usePageLoad } from "../../shared/hooks/usePageLoad";
import { useWorkspaceMissing } from "../../shared/hooks/useWorkspaceSetting";
import { NotFoundPage } from "../errors/NotFoundPage";
import { BUSINESSES_KEY } from "./businessKeys";
import { useBusinesses } from "./useBusiness";
import { FirstBusinessInvite } from "./BusinessesTab";
import ClosingWizard from "./ClosingWizard";

/**
 * «Νέο κλείσιμο» as a page of its own, under «Δουλειά» in the menu — as
 * «Νέα συναλλαγή» is under Transactions (`NewTransactionPage`).
 *
 * The same closing wizard the «+» of the summary opens, across the whole page
 * and down to the footer: today's date ready, the business asked only when
 * there is more than one. After a save the page says what went in, with
 * «Νέο κλείσιμο» again or the way to the summary; cancelling goes there too.
 * With no business yet, an invitation to make one where they are kept.
 */
export function NewClosingPage() {
  const access = useAccessState("business");
  const accessLoad = usePageLoad(access === "unknown");
  if (access === "off") return <NotFoundPage />;
  if (access === "unknown") return <ClosingFrame>{accessLoad === "waiting" ? <PageWaiting /> : <SkeletonRows count={4} />}</ClosingFrame>;
  return <NewClosingScreen />;
}

function ClosingFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <PageShell className="form-page">
      <PageHeader title={t("nav.newClosing")} subtitle={t("business.newClosingSubtitle")} />
      {children}
    </PageShell>
  );
}

function NewClosingScreen() {
  const navigate = useNavigate();
  const [businesses] = useBusinesses();
  // The businesses are one list on the account: until it has come, «none yet» would not be true.
  const businessesMissing = useWorkspaceMissing(BUSINESSES_KEY);
  const load = usePageLoad(businessesMissing);
  // Each «Νέο κλείσιμο» after a save starts a fresh wizard: today again, nothing typed.
  const [round, setRound] = useState(0);
  const toSummary = () => navigate("/business");

  return (
    <ClosingFrame>
      {load === "loading" ? (
        <SkeletonRows count={4} />
      ) : load === "waiting" ? (
        <PageWaiting />
      ) : businesses.length === 0 ? (
        <FirstBusinessInvite onAdd={() => navigate("/business/manage")} />
      ) : (
        <ClosingWizard key={round} asPage businesses={businesses} onClose={toSummary} onAgain={() => setRound((n) => n + 1)} />
      )}
    </ClosingFrame>
  );
}
