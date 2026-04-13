import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { useState, useEffect } from "react";
import "react-toastify/dist/ReactToastify.css";
import { queryClient } from "./lib/queryClient";
import { router } from "./lib/router";
import { AuthProvider } from "./context/AuthContext";
import { seedDefaultCategories } from "./firebase/seedCategories";

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}

function OfflineScreen() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a2e",
        color: "#ffffff",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <span style={{ fontSize: 64 }}>📡</span>
      <h2 style={{ marginTop: "1rem", fontWeight: 700, fontSize: "1.5rem" }}>No Internet Connection</h2>
      <p style={{ color: "#aaa", marginTop: "0.5rem", fontSize: "0.95rem" }}>Please check your connection and try again.</p>
    </div>
  );
}

export function App() {
  const isOnline = useOnlineStatus();

  // Runs once on mount — seeds only missing categories, safe on every app start
  useEffect(() => {
    seedDefaultCategories();
  }, []);

  if (!isOnline) {
    return <OfflineScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover />
        <ReactQueryDevtools initialIsOpen={false} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
