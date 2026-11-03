import type { MoneyAccount } from "./accountsUtils";

export const ACCOUNT_ICON = { bank: "🏦", cash: "👛" } as const;

// A bank account looks like the card in your wallet: one of six finishes, the
// one closest to the real thing. Cash is never a card — it is a banknote, always
// green, so the two are never confused at a glance.

export const CARD_COLORS = ["blue", "purple", "black", "teal", "red", "gold"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/** The finish of each card: the gradient on the card, and one solid colour for dots and bars. */
export const CARD_FINISH: Record<CardColor | "cash", { background: string; tone: string }> = {
  blue: { background: "linear-gradient(135deg, #0b2a7a 0%, #1d4ed8 55%, #2563eb 100%)", tone: "#1d4ed8" },
  purple: { background: "linear-gradient(135deg, #312e81 0%, #6d28d9 55%, #8b5cf6 100%)", tone: "#6d28d9" },
  black: { background: "linear-gradient(135deg, #0b0f14 0%, #1f2937 50%, #4b5563 100%)", tone: "#374151" },
  teal: { background: "linear-gradient(135deg, #134e4a 0%, #0d9488 55%, #14b8a6 100%)", tone: "#0d9488" },
  red: { background: "linear-gradient(135deg, #7f1d1d 0%, #e11d48 55%, #f43f5e 100%)", tone: "#e11d48" },
  gold: { background: "linear-gradient(135deg, #6b4f07 0%, #b7860b 50%, #eab308 100%)", tone: "#b7860b" },
  cash: { background: "linear-gradient(135deg, #1c6b47 0%, #2f9e6a 55%, #34a874 100%)", tone: "#2f9e6a" },
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
