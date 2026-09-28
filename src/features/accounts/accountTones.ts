import type { MoneyAccount } from "./accountsUtils";

export const ACCOUNT_ICON = { bank: "🏦", cash: "👛" } as const;

// Banks take the cool colours in turn; cash is always amber, so the wallet is
// the same colour wherever it appears.
const BANK_TONES = ["var(--bs-primary)", "var(--color-invest)", "var(--bs-teal)", "var(--bs-info)", "var(--bs-pink)"];

/** Each account's colour: its slice of the bar, and the tint of its tile. */
export function accountTones(accounts: Pick<MoneyAccount, "id" | "kind">[]): Record<string, string> {
  let bank = 0;
  return Object.fromEntries(accounts.map((a) => [a.id, a.kind === "cash" ? "var(--color-goal)" : BANK_TONES[bank++ % BANK_TONES.length]]));
}
