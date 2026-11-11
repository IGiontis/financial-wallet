import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { authForDemoSignIn } from "../firebase/config";
import { rememberKnownDevice, rememberSession, rememberWelcomeName } from "../lib/sessionHint";
import { savePendingSignUp, type PendingSignUp } from "../features/auth/pendingSignUp";
import type { AuthActions } from "../features/auth/authActions";
import { sendResetLink } from "../features/auth/passwordReset";

// ─── Signing in from the demo ────────────────────────────────────────────────
//
// «Σύνδεση» and «Δημιουργία λογαριασμού» open the real forms in a dialog over
// the demo (see `DemoAuthDialog`), rather than sending the visitor away to
// /login first. The forms are the same; what they call is not. The app's own
// sign-in functions refuse in the demo, on purpose — nothing the demo does may
// reach Firebase by accident. These reach it on purpose, through an Auth that
// is started only when one of them is called (`authForDemoSignIn`).
//
// Once signed in, nothing more happens on this page. The profile a new account
// needs is noted on the device (`savePendingSignUp`) and written by the real
// app; the page loads again, as the real app — the demo's in-memory store, its
// stand-in user and its query cache all stay behind with the old page, so not
// one figure of the made-up account can follow anyone into their own.

const googleProvider = new GoogleAuthProvider();

/** What the forms call in the dialog. Each one, synchronous up to the request, so Google's popup keeps the tap. */
export const demoAuthActions: AuthActions = {
  loginWithEmail: async (email, password) => (await signInWithEmailAndPassword(authForDemoSignIn(), email, password)).user,
  registerWithEmail: async (email, password) => (await createUserWithEmailAndPassword(authForDemoSignIn(), email, password)).user,
  loginWithGoogle: async () => (await signInWithPopup(authForDemoSignIn(), googleProvider)).user,
  sendPasswordReset: (email) => sendResetLink(authForDemoSignIn(), email),
};

/**
 * Into the real app, signed in: what is left to write is noted, the device
 * remembered as one someone signs in on — which is what makes the next page
 * load the app rather than the demo — and the page loads again at "/". It
 * replaces the demo in the history, so Back does not bring it out of the cache.
 */
export function enterRealApp(pending?: PendingSignUp) {
  if (pending) savePendingSignUp(pending);
  rememberSession(true);
  // No name from before: the welcome waits for the real profile to give one.
  rememberWelcomeName("");
  rememberKnownDevice();
  window.location.replace("/");
}
