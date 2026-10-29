import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  verifyBeforeUpdateEmail,
  type User,
} from "firebase/auth";
import { auth } from "./config";
import { forgetAllLocal } from "./syncList";
import { isDemo, leaveDemo } from "../demo/demoMode";

// ─── In the demo ──────────────────────────────────────────────────────────────
// There is no Firebase Auth behind the demo (see `config`): its user is a
// stand-in, and nothing here may reach the real thing. Signing out leaves the
// demo for the sign-in page; what only a real account can do is refused with a
// code the screens can recognise.

export const DEMO_UNAVAILABLE = "demo/unavailable";

function refuseInDemo() {
  if (isDemo()) throw Object.assign(new Error("Not available in the demo."), { code: DEMO_UNAVAILABLE });
}

// ─── Google provider ──────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

// ─── Register with email & password ──────────────────────────────────────────

export const registerWithEmail = async (email: string, password: string) => {
  refuseInDemo();
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
};

// ─── Login with email & password ─────────────────────────────────────────────

export const loginWithEmail = async (email: string, password: string) => {
  refuseInDemo();
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

// ─── Login with Google ────────────────────────────────────────────────────────

export const loginWithGoogle = async () => {
  refuseInDemo();
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = async () => {
  if (isDemo()) {
    // A full page load to the sign-in form. The promise is left pending on
    // purpose: the page is going, and a caller that went on to navigate inside
    // it would only flash the demo's own redirect on the way out.
    leaveDemo("/login");
    return new Promise<void>(() => {});
  }
  await signOut(auth);
  // The lists kept on this device for the delta sync go with the session.
  await forgetAllLocal();
};

// ─── Re-authenticate ──────────────────────────────────────────────────────────
// Required before sensitive operations (email/password change, delete account)

export const reauthenticate = async (currentPassword: string) => {
  refuseInDemo();
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("No authenticated user");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
};

// ─── Update email ─────────────────────────────────────────────────────────────
// Sends a verification link to the new address. The email only changes after the
// user clicks it. `updateEmail` is rejected by Firebase when email-enumeration
// protection is on (the modern default), so we use the verify-before flow.

export const updateUserEmail = async (newEmail: string) => {
  refuseInDemo();
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  await verifyBeforeUpdateEmail(user, newEmail);
};

// ─── Update password ──────────────────────────────────────────────────────────

export const updateUserPassword = async (newPassword: string) => {
  refuseInDemo();
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  await updatePassword(user, newPassword);
};

// ─── Delete account ───────────────────────────────────────────────────────────

export const deleteAccount = async () => {
  refuseInDemo();
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  await deleteUser(user);
};

// ─── Check if user signed in with Google ─────────────────────────────────────

export const isGoogleUser = (): boolean => {
  // The demo's user signs in with a password, as far as any screen can tell.
  if (isDemo()) return false;
  const user = auth.currentUser;
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === "google.com");
};

// ─── Auth state listener ──────────────────────────────────────────────────────

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
