// The categories every account shares, seeded once with fixed English names
// (see `seedCategories`) and translated for display (`shared/utils/categories`).
// Their own module so the demo's made-up account (`demo/fixtures`) can list
// them without opening Firestore.

export const DEFAULT_CATEGORIES = [
  // ── Expenses ────────────────────────────────────────────────────────────────
  { name: "Groceries", type: "expense", icon: "🛒", color: "#10B981", isDefault: true, userId: null },
  { name: "Shopping", type: "expense", icon: "🏪", color: "#3B82F6", isDefault: true, userId: null },
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
  { name: "Gym", type: "expense", icon: "🏋️", color: "#0EA5E9", isDefault: true, userId: null },
  { name: "Sports Betting", type: "expense", icon: "🎰", color: "#EF4444", isDefault: true, userId: null },
  { name: "Pet", type: "expense", icon: "🐾", color: "#F59E0B", isDefault: true, userId: null },
  { name: "Games", type: "expense", icon: "🎮", color: "#7C3AED", isDefault: true, userId: null },
  { name: "Taxes", type: "expense", icon: "🧾", color: "#EF4444", isDefault: true, userId: null },
  { name: "Skroutz", type: "expense", icon: "📦", color: "#F97316", isDefault: true, userId: null },
  { name: "Coffee", type: "expense", icon: "☕", color: "#92400E", isDefault: true, userId: null },
  { name: "Internet", type: "expense", icon: "🌐", color: "#0284C7", isDefault: true, userId: null },
  { name: "Electricity", type: "expense", icon: "⚡", color: "#EAB308", isDefault: true, userId: null },
  { name: "Water", type: "expense", icon: "💧", color: "#06B6D4", isDefault: true, userId: null },
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
