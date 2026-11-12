// ─── Where a user's data lives ────────────────────────────────────────────────
//
// Every collection the app writes a user's documents to, each document carrying
// `userId`. Deleting an account removes exactly these (`deleteAllUserData`), and
// `ownedCollections.test.ts` reads the source for every collection name written
// anywhere and fails if one is missing here — a new collection that is not
// listed would otherwise outlive the account it belongs to.
//
// `budgets` is no longer written; it stays because older accounts still have
// documents in it. The per-user settings, the planner, the banks and their
// readings and the sync's deletion log are fields on `users/{uid}`, which goes
// last, on its own (see `deleteAllUserData`).
//
// Categories: only the user's own (`userId` set). The seeded defaults carry no
// `userId`, are shared by everyone, and are never touched.

export const OWNED_COLLECTIONS = ["transactions", "investmentGoals", "investmentContributions", "budgets", "categories", "bills", "billPayments", "debts", "debtPayments", "businessEntries"] as const;

export type OwnedCollection = (typeof OWNED_COLLECTIONS)[number];

/** The profile document, `users/{uid}`: keyed by the uid, not by a `userId` field. */
export const USERS_COLLECTION = "users";
