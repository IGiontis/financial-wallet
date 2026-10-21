import type { TFunction } from "i18next";
import { mainAccount, type MoneyAccount } from "../accounts/accountsUtils";

/**
 * Where a debt's money went, in words: the card's name, the main one's for "",
 * or «Χωρίς κίνηση λεφτών» when none moved.
 */
export function moneyMovedName(accountId: string | undefined, accounts: MoneyAccount[], t: TFunction): string {
  if (accountId === undefined) return t("debts.noMoney");
  const named = accounts.find((a) => a.id === accountId);
  if (named) return named.name;
  const main = mainAccount(accounts);
  return main ? main.name : t("accounts.noCard");
}
