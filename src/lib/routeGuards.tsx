import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Container } from "reactstrap";
import { SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../shared/components/Skeletons";
import { useAuth } from "../shared/hooks/useAuth";
import { hadSession } from "./sessionHint";
import { AuthSkeleton } from "../features/auth/AuthSkeleton";

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
 */
export function SessionGate() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return hadSession() ? <Outlet /> : <AuthSkeleton />;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
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

/** Login/register pages — redirects away once the user is signed in. */
export function PublicOnlyRoute() {
  const { currentUser, loading } = useAuth();

  if (loading) return <AuthSkeleton />;
  if (currentUser) return <Navigate to="/" replace />;
  return <Outlet />;
}
