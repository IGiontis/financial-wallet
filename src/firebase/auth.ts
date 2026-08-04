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

// ─── Google provider ──────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

// ─── Register with email & password ──────────────────────────────────────────

export const registerWithEmail = async (email: string, password: string) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
};

// ─── Login with email & password ─────────────────────────────────────────────

export const loginWithEmail = async (email: string, password: string) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

// ─── Login with Google ────────────────────────────────────────────────────────

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = async () => {
  await signOut(auth);
};

// ─── Re-authenticate ──────────────────────────────────────────────────────────
// Required before sensitive operations (email/password change, delete account)

export const reauthenticate = async (currentPassword: string) => {
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
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  await verifyBeforeUpdateEmail(user, newEmail);
};

// ─── Update password ──────────────────────────────────────────────────────────

export const updateUserPassword = async (newPassword: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  await updatePassword(user, newPassword);
};

// ─── Delete account ───────────────────────────────────────────────────────────

export const deleteAccount = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  await deleteUser(user);
};

// ─── Check if user signed in with Google ─────────────────────────────────────

export const isGoogleUser = (): boolean => {
  const user = auth.currentUser;
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === "google.com");
};

// ─── Auth state listener ──────────────────────────────────────────────────────

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
