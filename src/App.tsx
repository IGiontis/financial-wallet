import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getUser } from "./firebase/firestore";
import { exchangeRateKeys } from "./shared/hooks/useCurrencyConverter";
import "react-toastify/dist/ReactToastify.css";
import { queryClient } from "./lib/queryClient";
import { router } from "./lib/router";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./shared/hooks/useAuth";
import { ThemeProvider } from "./context/ThemeContext";
import { seedDefaultCategories } from "./firebase/seedCategories";
import { useOnlineStatus } from "./shared/hooks/useOnlineStatus";

// Devtools are a development-only aid — lazily imported so the bundle Vite ships
// to users never contains them.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
  : null;

// ─── Offline banner ─────────────────────────────────────────────────────────
// Non-blocking: the app stays usable (cached data, PWA) while we show a slim
// bar. This replaces the old full-screen block that broke the offline promise.
function OfflineBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2000,
        background: "var(--color-tooltip-bg)",
        color: "var(--color-tooltip-text)",
        textAlign: "center",
        fontSize: 13,
        fontWeight: 500,
        padding: "8px 16px",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.2)",
      }}
    >
      📡 {t("common.offline")}
    </div>
  );
}

// ─── Seeds default categories once the user is authenticated ────────────────
// Gated on auth so anonymous visitors never trigger Firestore reads/writes.
function CategorySeeder() {
  const { currentUser } = useAuth();
  useEffect(() => {
    if (currentUser) seedDefaultCategories();
  }, [currentUser]);
  return null;
}

// ─── Applies the language saved on the user's account ───────────────────────
// Keeps the choice consistent across devices; localStorage still wins for the
// very first paint, so there's no flash of the wrong language.
function LanguageSync() {
  const { currentUser } = useAuth();
  const { i18n } = useTranslation();
  const { data: user } = useQuery({
    queryKey: exchangeRateKeys.user(currentUser?.uid ?? ""),
    queryFn: () => getUser(currentUser!.uid),
    enabled: !!currentUser?.uid,
  });

  useEffect(() => {
    const locale = user?.locale;
    if (locale && locale !== i18n.resolvedLanguage) {
      i18n.changeLanguage(locale);
    }
  }, [user?.locale, i18n]);

  return null;
}

export function App() {
  const isOnline = useOnlineStatus();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <CategorySeeder />
          <LanguageSync />
          <RouterProvider router={router} />
          {!isOnline && <OfflineBanner />}
          <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover theme="colored" />
          {ReactQueryDevtools && (
            <Suspense fallback={null}>
              <ReactQueryDevtools initialIsOpen={false} />
            </Suspense>
          )}
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
