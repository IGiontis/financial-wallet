import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Container } from "reactstrap";
import { Skeleton, SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../shared/components/Skeletons";
import { useAuth } from "../shared/hooks/useAuth";

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

/** The login/register form's outline — all that sits behind PublicOnlyRoute. */
function AuthLoader() {
  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: "80vh" }}>
      <SkeletonCard style={{ width: "100%", maxWidth: 380 }}>
        <SkeletonHeading width="55%" />
        <Skeleton height={38} style={{ borderRadius: "var(--border-radius-md)" }} />
        <Skeleton height={38} style={{ borderRadius: "var(--border-radius-md)", marginTop: 12 }} />
        <Skeleton height={38} style={{ borderRadius: "var(--border-radius-md)", marginTop: 20 }} />
      </SkeletonCard>
    </Container>
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

/** Login/register pages — redirects away once the user is signed in. */
export function PublicOnlyRoute() {
  const { currentUser, loading } = useAuth();

  if (loading) return <AuthLoader />;
  if (currentUser) return <Navigate to="/" replace />;
  return <Outlet />;
}
