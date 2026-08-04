import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "reactstrap";
import { useAuth } from "../context/AuthContext";

/** Centred spinner shown while a lazy route chunk loads. */
export function PageLoader() {
  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "60vh" }}>
      <Spinner color="primary" />
    </div>
  );
}

/** Requires an authenticated user; otherwise bounces to /login. */
export function ProtectedRoute() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/register pages — redirects away once the user is signed in. */
export function PublicOnlyRoute() {
  const { currentUser, loading } = useAuth();

  if (loading) return null;
  if (currentUser) return <Navigate to="/" replace />;
  return <Outlet />;
}
