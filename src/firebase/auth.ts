import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  type User,
} from "firebase/auth";
import { auth } from "./config";

// ─── Google provider ──────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

// ─── Register with email & password ──────────────────────────────────────────

export const registerWithEmail = async (email: string, password: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    throw err;
  }
};

// ─── Login with email & password ─────────────────────────────────────────────

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    throw err;
  }
};

// ─── Login with Google ────────────────────────────────────────────────────────

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    throw err;
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (err) {
    throw err;
  }
};

// ─── Re-authenticate ──────────────────────────────────────────────────────────
// Required before sensitive operations (email/password change, delete account)

export const reauthenticate = async (currentPassword: string) => {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error("No authenticated user");
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
  } catch (err) {
    throw err;
  }
};

// ─── Update email ─────────────────────────────────────────────────────────────

export const updateUserEmail = async (newEmail: string) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user");
    await updateEmail(user, newEmail);
  } catch (err) {
    throw err;
  }
};

// ─── Update password ──────────────────────────────────────────────────────────

export const updateUserPassword = async (newPassword: string) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user");
    await updatePassword(user, newPassword);
  } catch (err) {
    throw err;
  }
};

// ─── Delete account ───────────────────────────────────────────────────────────

export const deleteAccount = async () => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user");
    await deleteUser(user);
  } catch (err) {
    throw err;
  }
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
