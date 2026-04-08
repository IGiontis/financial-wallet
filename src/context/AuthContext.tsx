import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type User } from "firebase/auth";
import { onAuthStateChange } from "../firebase/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextType {
  currentUser: User | null; // Firebase auth user
  loading: boolean; // true while Firebase checks login state on startup
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase calls this immediately on startup with the current user
    // and again every time the user logs in or out
    const unsubscribe = onAuthStateChange((user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    // Clean up the listener when the component unmounts
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={{ currentUser, loading }}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Use this anywhere in your app: const { currentUser } = useAuth()

export const useAuth = () => useContext(AuthContext);
