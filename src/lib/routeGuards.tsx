import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Container } from "reactstrap";
import { useQuery } from "@tanstack/react-query";
import { SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../shared/components/Skeletons";
import { useAuth } from "../shared/hooks/useAuth";
import { hadSession, rememberWelcomeName } from "./sessionHint";
import { AuthSkeleton } from "../features/auth/AuthSkeleton";
import { WelcomeSplash } from "../features/auth/WelcomeSplash";
import { finishPendingSignUpWithRetry } from "../features/auth/pendingSignUp";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { getUser } from "../firebase/firestore";
import { exchangeRateKeys } from "../shared/hooks/useCurrencyConverter";
import { isDemo } from "../demo/demoMode";
import { resolveDisplayName } from "../features/settings/displayName";

/**
 * Past this, the welcome goes even if the profile has not come: a slow
 * connection should see the app's frame taking shape, not a greeting.
 */
const PROFILE_WAIT_MS = 900;

/**
 * The signed-in person's profile, as the shell reads it — this only listens.
 * Never fetches (`enabled: false`): the top bar and the language sync read the
 * same document under the same key, and a third reader must not cost a read.
 * Returns whether it has arrived (or failed to).
 */
function useProfileArrived(user: { uid: string; email?: string | null; displayName?: string | null; providerData?: { providerId: string }[] } | null): boolean {
  const uid = user?.uid;
  const { data, isFetched } = useQuery({
    queryKey: exchangeRateKeys.user(uid ?? ""),
    queryFn: () => getUser(uid!),
    enabled: false,
  });
  // Kept for the next app open's welcome (see `WelcomeSplash`).
  // The same name the top bar shows (see `resolveDisplayName`).
  const name = data
    ? resolveDisplayName({
        custom: data.displayName,
        isGoogle: user?.providerData?.[0]?.providerId === "google.com",
        googleName: user?.displayName,
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        email: user?.email,
      })
    : "";
  useEffect(() => {
    // Never the demo's made-up person: whoever signs in next is not her.
    if (uid && name && !isDemo()) rememberWelcomeName(name);
  }, [uid, name]);
  return isFetched || data !== undefined;
}

/** Whether `ms` have passed since `start` turned true. */
function useElapsedSince(start: boolean, ms: number): boolean {
  const [passed, setPassed] = useState(false);
  useEffect(() => {
    if (!start) return;
    const timer = window.setTimeout(() => setPassed(true), ms);
    return () => window.clearTimeout(timer);
  }, [start, ms]);
  return passed;
}

/**
 * Stands in for a lazy route chunk.
 *
 * One shape has to serve twelve pages, so it is the layout they share — title,
 * a strip of figures, a wide panel and a list — rather than any one of them.
 * The container matches the pages' own, so the header lands where it will stay.
 */
export function PageLoader() {
  return (
    <Container fluid className="py-4">
      <SkeletonPageHeader />
      <SkeletonStats />
      <div className="row g-3">
        <div className="col-12 col-lg-8">
          <SkeletonChartCard height={260} />
        </div>
        <div className="col-12 col-lg-4">
          <SkeletonCard>
            <SkeletonHeading />
            <SkeletonRows count={5} />
          </SkeletonCard>
        </div>
      </div>
    </Container>
  );
}

/**
 * Around the app's layout: while the session is being found, the app's frame
 * only for a device that was signed in — otherwise the form's outline — and
 * signed out, to /login before any of the app is drawn.
 *
 * A device that was signed in is also welcomed back (`WelcomeSplash`), over
 * the frame as it draws. It is `ready` to go once the session is found and the
 * profile has come — or `PROFILE_WAIT_MS` after the session — and goes within
 * the few seconds it allows itself to be read (see `WelcomeSplash`). Decided once
 * per app open: the demo and a device never signed in are not welcomed.
 *
 * Signed in, it finishes what a sign-up from the demo's dialog left to write
 * (see `pendingSignUp`) — nothing, on every other start.
 */
export function SessionGate() {
  const { t } = useTranslation();
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  const [welcome] = useState(() => !!(loading && hadSession()));
  const uid = currentUser?.uid;
  const profileArrived = useProfileArrived(currentUser);
  const waitedEnough = useElapsedSince(!loading, PROFILE_WAIT_MS);

  useEffect(() => {
    // Never in the demo, whose user is a stand-in and whose page writes nothing.
    if (!uid || isDemo()) return;
    return finishPendingSignUpWithRetry(uid, () => toast.warning(t("auth.profilePending")));
  }, [uid, t]);

  const ready = !loading && (!currentUser || profileArrived || waitedEnough);
  const splash = welcome && <WelcomeSplash ready={ready} />;

  if (loading)
    return hadSession() ? (
      <>
        <Outlet />
        {splash}
      </>
    ) : (
      <AuthSkeleton />
    );
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <>
      <Outlet />
      {splash}
    </>
  );
}

/** Requires an authenticated user; otherwise bounces to /login. */
export function ProtectedRoute() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // Firebase resolves the session asynchronously even when it is cached, so
  // this branch is every cold load — rendering nothing made it a white page.
  if (loading) return <PageLoader />;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/**
 * «Δικαιούχοι & κατηγορίες» was one page with two tabs under «Συναλλαγές»
 * (`/transactions/names?tab=payees|categories`). It is its own menu entry with
 * two child routes now — a section's sub-pages are child routes, never inner
 * tabs (`.claude/rules/ui.md` 2) — so an old link or bookmark is sent to the
 * page that took its tab over, carrying anything else that was in the address.
 */
export function NamesRedirect() {
  const [params] = useSearchParams();
  const page = params.get("tab") === "categories" ? "categories" : "payees";
  const rest = new URLSearchParams(params);
  rest.delete("tab");
  const query = rest.toString();
  return <Navigate to={`/names/${page}${query ? `?${query}` : ""}`} replace />;
}

/** Login/register pages — redirects away once the user is signed in. */
export function PublicOnlyRoute() {
  const { currentUser, loading } = useAuth();

  if (loading) return <AuthSkeleton />;
  if (currentUser) return <Navigate to="/" replace />;
  return <Outlet />;
}
