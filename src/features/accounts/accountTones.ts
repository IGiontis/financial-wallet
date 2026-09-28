import type { MoneyAccount } from "./accountsUtils";

export const ACCOUNT_ICON = { bank: "🏦", cash: "👛" } as const;

// A bank account looks like the card in your wallet: one of six finishes, the
// one closest to the real thing. Cash is never a card — it is a banknote, always
// green, so the two are never confused at a glance.

export const CARD_COLORS = ["blue", "purple", "black", "teal", "red", "gold"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/** The finish of each card: the gradient on the card, and one solid colour for dots and bars. */
export const CARD_FINISH: Record<CardColor | "cash", { background: string; tone: string }> = {
  blue: { background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 45%, #0b2a7a 100%)", tone: "#1d4ed8" },
  purple: { background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 45%, #312e81 100%)", tone: "#6d28d9" },
  black: { background: "linear-gradient(135deg, #4b5563 0%, #1f2937 50%, #0b0f14 100%)", tone: "#374151" },
  teal: { background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 45%, #134e4a 100%)", tone: "#0d9488" },
  red: { background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 45%, #7f1d1d 100%)", tone: "#e11d48" },
  gold: { background: "linear-gradient(135deg, #eab308 0%, #b7860b 50%, #6b4f07 100%)", tone: "#b7860b" },
  cash: { background: "linear-gradient(135deg, #34a874 0%, #2f9e6a 45%, #1c6b47 100%)", tone: "#2f9e6a" },
};

/** Each account's finish: the one chosen, else the next in line for banks, green for cash. */
export function accountFinishes(accounts: Pick<MoneyAccount, "id" | "kind" | "color">[]): Record<string, CardColor | "cash"> {
  let bank = 0;
  return Object.fromEntries(
    accounts.map((a) => {
      if (a.kind === "cash") return [a.id, "cash"];
      const fallback = CARD_COLORS[bank++ % CARD_COLORS.length];
      return [a.id, a.color && CARD_COLORS.includes(a.color) ? a.color : fallback];
    }),
  );
}

/** Each account's solid colour — its slice of the bar, and the tint of its icon. */
export function accountTones(accounts: Pick<MoneyAccount, "id" | "kind" | "color">[]): Record<string, string> {
  const finishes = accountFinishes(accounts);
  return Object.fromEntries(Object.entries(finishes).map(([id, finish]) => [id, CARD_FINISH[finish].tone]));
}
