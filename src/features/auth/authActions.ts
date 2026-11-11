import type { User } from "firebase/auth";
import { loginWithEmail, loginWithGoogle, registerWithEmail, sendPasswordReset } from "../../firebase/auth";

/**
 * The ways in that the sign-in and sign-up forms call. On their pages,
 * the app's own (`firebase/auth`); in the demo's dialog, ones that reach a
 * real account from a page that has none behind it (`demo/demoSignIn`).
 */
export interface AuthActions {
  loginWithEmail: (email: string, password: string) => Promise<User>;
  registerWithEmail: (email: string, password: string) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  /** «Ξέχασα τον κωδικό»: Firebase emails a link for a new one. */
  sendPasswordReset: (email: string) => Promise<void>;
}

// Looked up when called rather than when this module loads.
export const appAuthActions: AuthActions = {
  loginWithEmail: (email, password) => loginWithEmail(email, password),
  registerWithEmail: (email, password) => registerWithEmail(email, password),
  loginWithGoogle: () => loginWithGoogle(),
  sendPasswordReset: (email) => sendPasswordReset(email),
};
