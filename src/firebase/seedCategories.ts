import { collection, getDocs, writeBatch, doc, query, where } from "firebase/firestore";
import { db } from "./config";

const DEFAULT_CATEGORIES = [
  // ── Expenses ────────────────────────────────────────────────────────────────
  { name: "Groceries", type: "expense", icon: "🥬", color: "#10B981", isDefault: true, userId: null },
  { name: "Shopping", type: "expense", icon: "🛒", color: "#3B82F6", isDefault: true, userId: null },
  { name: "Dining Out", type: "expense", icon: "🍽️", color: "#F59E0B", isDefault: true, userId: null },
  { name: "Drinks Out", type: "expense", icon: "🍺", color: "#F97316", isDefault: true, userId: null },
  { name: "Transport", type: "expense", icon: "🚗", color: "#6366F1", isDefault: true, userId: null },
  { name: "Fuel", type: "expense", icon: "⛽", color: "#64748B", isDefault: true, userId: null },
  { name: "Utilities", type: "expense", icon: "💡", color: "#EF4444", isDefault: true, userId: null },
  { name: "Healthcare", type: "expense", icon: "🏥", color: "#EC4899", isDefault: true, userId: null },
  { name: "Entertainment", type: "expense", icon: "🎬", color: "#8B5CF6", isDefault: true, userId: null },
  { name: "Education", type: "expense", icon: "🎓", color: "#14B8A6", isDefault: true, userId: null },
  { name: "Rent", type: "expense", icon: "🏠", color: "#F97316", isDefault: true, userId: null },
  { name: "Insurance", type: "expense", icon: "🛡️", color: "#64748B", isDefault: true, userId: null },
  { name: "Subscriptions", type: "expense", icon: "📱", color: "#0EA5E9", isDefault: true, userId: null },
  { name: "Travel", type: "expense", icon: "✈️", color: "#D946EF", isDefault: true, userId: null },
  { name: "Personal Care", type: "expense", icon: "💈", color: "#F43F5E", isDefault: true, userId: null },
  { name: "Sports Betting", type: "expense", icon: "🎰", color: "#EF4444", isDefault: true, userId: null },
  { name: "Pet", type: "expense", icon: "🐾", color: "#F59E0B", isDefault: true, userId: null },
  { name: "Games", type: "expense", icon: "🎮", color: "#7C3AED", isDefault: true, userId: null },
  { name: "Taxes", type: "expense", icon: "🧾", color: "#EF4444", isDefault: true, userId: null },
  { name: "Other Expense", type: "expense", icon: "💸", color: "#94A3B8", isDefault: true, userId: null },

  // ── Income ──────────────────────────────────────────────────────────────────
  { name: "Salary", type: "income", icon: "💼", color: "#10B981", isDefault: true, userId: null },
  { name: "Freelance", type: "income", icon: "💻", color: "#3B82F6", isDefault: true, userId: null },
  { name: "Investments", type: "income", icon: "📈", color: "#6366F1", isDefault: true, userId: null },
  { name: "Gifts", type: "income", icon: "🎁", color: "#F59E0B", isDefault: true, userId: null },
  { name: "Sports Betting", type: "income", icon: "🎰", color: "#10B981", isDefault: true, userId: null },
  { name: "Taxes", type: "income", icon: "🧾", color: "#10B981", isDefault: true, userId: null },
  { name: "Government Aid", type: "income", icon: "🏛️", color: "#6366F1", isDefault: true, userId: null }, 
  { name: "Other Income", type: "income", icon: "💰", color: "#94A3B8", isDefault: true, userId: null },
];

/**
 * Safe to call on every app start.
 * Checks each category by name+type — only inserts what's missing.
 * Never touches existing categories.
 * To add more in the future: just add to DEFAULT_CATEGORIES above.
 */
export const seedDefaultCategories = async (): Promise<void> => {
  try {
    const snapshot = await getDocs(query(collection(db, "categories"), where("isDefault", "==", true)));

    // Build a set of "name|type" keys that already exist in Firestore
    const existingKeys = new Set<string>();
    snapshot.forEach((doc) => {
      const d = doc.data();
      existingKeys.add(`${d.name}|${d.type}`);
    });

    // Only insert categories that are genuinely missing
    const toInsert = DEFAULT_CATEGORIES.filter((cat) => !existingKeys.has(`${cat.name}|${cat.type}`));

    if (toInsert.length === 0) return; // nothing to do

    const batch = writeBatch(db);
    toInsert.forEach((cat) => {
      const ref = doc(collection(db, "categories"));
      batch.set(ref, { ...cat, createdAt: new Date(), updatedAt: new Date() });
    });

    await batch.commit();
    console.log(`Seeded ${toInsert.length} missing default categories.`);
  } catch (err) {
    console.error("Failed to seed categories:", err);
  }
};
