import type { TFunction } from "i18next";

// Default categories are seeded once with fixed English names (see
// firebase/seedCategories.ts) and that raw name is used as an identity value
// throughout the app — filter comparisons, <option value>, Firestore queries.
// We never touch the stored name; this only maps it to a translation key for
// display. A category with no entry here is one the user typed themselves,
// so it falls back to their own text unchanged.
export const CATEGORY_KEYS: Record<string, string> = {
  Groceries: "groceries",
  Shopping: "shopping",
  "Dining Out": "diningOut",
  "Drinks Out": "drinksOut",
  Transport: "transport",
  Fuel: "fuel",
  Utilities: "utilities",
  Healthcare: "healthcare",
  Entertainment: "entertainment",
  Education: "education",
  Rent: "rent",
  Insurance: "insurance",
  Subscriptions: "subscriptions",
  Travel: "travel",
  "Personal Care": "personalCare",
  Gym: "gym",
  "Sports Betting": "sportsBetting",
  Pet: "pet",
  Games: "games",
  Taxes: "taxes",
  Skroutz: "skroutz",
  Coffee: "coffee",
  Internet: "internet",
  Electricity: "electricity",
  Water: "water",
  "Other Expense": "otherExpense",
  Salary: "salary",
  Freelance: "freelance",
  Investments: "investments",
  Gifts: "gifts",
  "Government Aid": "governmentAid",
  "Other Income": "otherIncome",
  // Synthetic categories some screens fabricate on the fly for goal/investment
  // rows that don't have a real category document.
  Goal: "goal",
};

export function categoryLabel(name: string | null | undefined, t: TFunction): string {
  if (!name) return "";
  const key = CATEGORY_KEYS[name];
  return key ? t(`categories.${key}`) : name;
}
