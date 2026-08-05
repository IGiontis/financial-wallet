import { createContext } from "react";
import { type User } from "firebase/auth";

export interface AuthContextType {
  currentUser: User | null; // Firebase auth user
  loading: boolean; // true while Firebase checks login state on startup
}

// Lives apart from AuthProvider so that file exports only a component and React
// Fast Refresh keeps working — same split as ThemeContext.
export const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
});
