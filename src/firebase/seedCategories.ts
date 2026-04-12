import { collection, getDocs, writeBatch, doc, query, where } from "firebase/firestore";
import { db } from "./config";

const DEFAULT_CATEGORIES = [
  // ── Expense categories ──────────────────────────────────────────────────────
  { name: "Groceries", type: "expense", icon: "🥬", color: "#10B981", isDefault: true, userId: null },
  { name: "Shopping", type: "expense", icon: "🛒", color: "#3B82F6", isDefault: true, userId: null },
  { name: "Dining Out", type: "expense", icon: "🍽️", color: "#F59E0B", isDefault: true, userId: null },
  { name: "Drinks Out", type: "expense", icon: "🍺", color: "#F97316", isDefault: true, userId: null },
  { name: "Transport", type: "expense", icon: "🚗", color: "#6366F1", isDefault: true, userId: null },
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
  { name: "Other Expense", type: "expense", icon: "💸", color: "#94A3B8", isDefault: true, userId: null },

  // ── Income categories ───────────────────────────────────────────────────────
  { name: "Salary", type: "income", icon: "💼", color: "#10B981", isDefault: true, userId: null },
  { name: "Freelance", type: "income", icon: "💻", color: "#3B82F6", isDefault: true, userId: null },
  { name: "Investments", type: "income", icon: "📈", color: "#6366F1", isDefault: true, userId: null },
  { name: "Gifts", type: "income", icon: "🎁", color: "#F59E0B", isDefault: true, userId: null },
  { name: "Sports Betting", type: "income", icon: "🎰", color: "#10B981", isDefault: true, userId: null },
  { name: "Other Income", type: "income", icon: "💰", color: "#94A3B8", isDefault: true, userId: null },
];

export const seedDefaultCategories = async (): Promise<void> => {
  try {
    const existing = await getDocs(query(collection(db, "categories"), where("isDefault", "==", true)));
    if (!existing.empty) return;

    const batch = writeBatch(db);
    DEFAULT_CATEGORIES.forEach((cat) => {
      const ref = doc(collection(db, "categories"));
      batch.set(ref, { ...cat, createdAt: new Date(), updatedAt: new Date() });
    });
    await batch.commit();
  } catch (err) {
    console.error("Failed to seed categories:", err);
  }
};
