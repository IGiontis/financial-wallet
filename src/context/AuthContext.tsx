import { useEffect, useMemo, useState, type ReactNode } from "react";
import { type User } from "firebase/auth";
import { onAuthStateChange } from "../firebase/auth";
import { AuthContext } from "./authContextValue";
import { rememberKnownDevice, rememberSession } from "../lib/sessionHint";
import { isDemo } from "../demo/demoMode";
import { demoUser } from "../demo/demoUser";

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // The demo is signed in from the first frame, as its stand-in user, and never
  // asks Firebase anything — there is no Auth behind it (see `demo/demoMode`).
  const [currentUser, setCurrentUser] = useState<User | null>(() => (isDemo() ? demoUser : null));
  const [loading, setLoading] = useState(() => !isDemo());

  useEffect(() => {
    if (isDemo()) return;
    // Firebase calls this immediately on startup with the current user
    // and again every time the user logs in or out
    const unsubscribe = onAuthStateChange((user) => {
      rememberSession(!!user);
      // Kept through signing out: the next visit opens on the sign-in form, not the demo.
      if (user) rememberKnownDevice();
      setCurrentUser(user);
      setLoading(false);
    });

    // Clean up the listener when the component unmounts
    return unsubscribe;
  }, []);

  // Memoised so consumers don't re-render every time a parent renders — every
  // page in the app reads this context.
  const value = useMemo(() => ({ currentUser, loading }), [currentUser, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
