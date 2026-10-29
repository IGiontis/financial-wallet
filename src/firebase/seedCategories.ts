import { collection, getDocs, writeBatch, doc, query, where } from "./firestoreApi";
import { db } from "./config";
import { DEFAULT_CATEGORIES } from "./defaultCategories";
import { isDemo } from "../demo/demoMode";

// Bump this whenever DEFAULT_CATEGORIES changes, so existing installs re-run
// the check once and pick up the new entries.
const SEED_VERSION = String(DEFAULT_CATEGORIES.length);
const SEED_FLAG_KEY = "categories-seeded-version";

/**
 * Safe to call on every app start.
 * Checks each category by name+type — only inserts what's missing.
 * Never touches existing categories.
 * To add more in the future: just add to DEFAULT_CATEGORIES above.
 *
 * The localStorage flag keeps this from costing a full collection read on every
 * single app start — the seed only ever needs to run once per device per list
 * revision, and the read alone was ~34 documents each time.
 */
export const seedDefaultCategories = async (): Promise<void> => {
  // The demo's account comes with them, and its flag must not be left on a
  // device for the account someone signs in to later.
  if (isDemo()) return;
  try {
    if (localStorage.getItem(SEED_FLAG_KEY) === SEED_VERSION) return;

    const snapshot = await getDocs(query(collection(db, "categories"), where("isDefault", "==", true)));

    // Build a set of "name|type" keys that already exist in Firestore
    const existingKeys = new Set<string>();
    snapshot.forEach((doc) => {
      const d = doc.data();
      existingKeys.add(`${d.name}|${d.type}`);
    });

    // Only insert categories that are genuinely missing
    const toInsert = DEFAULT_CATEGORIES.filter((cat) => !existingKeys.has(`${cat.name}|${cat.type}`));

    if (toInsert.length > 0) {
      const batch = writeBatch(db);
      toInsert.forEach((cat) => {
        const ref = doc(collection(db, "categories"));
        batch.set(ref, { ...cat, createdAt: new Date(), updatedAt: new Date() });
      });
      await batch.commit();
    }

    // Only mark done once the check actually completed — a failure above leaves
    // the flag unset so the next start retries.
    localStorage.setItem(SEED_FLAG_KEY, SEED_VERSION);
  } catch (err) {
    // The shared defaults are the Console's to add: the security rules let a
    // user create only their own categories, so a missing default is refused
    // here, and would be refused again on every start — at ~34 reads a try.
    // Marked done instead; anything else (offline, say) retries next start.
    if ((err as { code?: string })?.code === "permission-denied") {
      localStorage.setItem(SEED_FLAG_KEY, SEED_VERSION);
      return;
    }
    console.error("Failed to seed categories:", err);
  }
};
