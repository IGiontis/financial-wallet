// ─── Nothing writes while an account is being deleted ────────────────────────
//
// The session is still alive while its account is taken apart: a debounced
// planner save, a profile made for a Google sign-in, the category seed, a
// screen that was mid-mutation. Any of them landing after the deletion swept a
// collection would put a document back into an account that is about to stop
// existing — left behind for good once the sign-in is gone, with no one able to
// reach it. So the deletion closes this gate first, and every write that goes
// through `firestoreApi` (sets, adds, updates, a batch's sets and updates) is
// refused while it is closed. Deletes still pass: they are the deletion.
//
// It opens again only if the deletion fails before the data is touched or
// part-way through it, so the account can be used or deleted again. Once the
// data is gone it stays shut until the page loads again.

let deletingUid: string | null = null;

export const ACCOUNT_DELETING = "account/deleting";

export function beginAccountDeletion(uid: string) {
  deletingUid = uid;
}

export function endAccountDeletion() {
  deletingUid = null;
}

export function isDeletingAccount(): boolean {
  return deletingUid !== null;
}

/** The refusal, as an error a screen can recognise by its `code`. */
export function accountDeletingError() {
  return Object.assign(new Error("The account is being deleted; nothing more is saved."), { code: ACCOUNT_DELETING });
}

/** Throws while the gate is closed. */
export function refuseWhileDeleting() {
  if (deletingUid !== null) throw accountDeletingError();
}
