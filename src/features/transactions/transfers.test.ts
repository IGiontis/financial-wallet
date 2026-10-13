import { describe, it, expect } from "vitest";
import { oneRowPerTransfer, transferOf, transferProblem, transferRecords } from "./transfers";
import { expectedByAccount, readCheckIns, type MoneyAccount } from "../accounts/accountsUtils";
import { isEarning, isMoneyMove, isSpending } from "../../shared/utils/moneyModel";
import type { Transaction } from "../../shared/types/IndexTypes";

// A transfer moves money between your own accounts and nothing else. What is
// pinned here is exactly that, checked from the accounts' side: the account it
// left goes down, the one it reached goes up by the same, the total does not
// move, and no report counts either half as income or spending.

const accounts: MoneyAccount[] = [
  { id: "eb", name: "Eurobank", kind: "bank", main: true },
  { id: "rev", name: "Revolut", kind: "bank" },
  { id: "cash", name: "Μετρητά", kind: "cash" },
];

const asTx = (record: ReturnType<typeof transferRecords>[number], created: Date): Transaction => ({ ...record, userId: "u", createdAt: created, updatedAt: created }) as Transaction;

describe("a transfer", () => {
  const [out, inn] = transferRecords({ id: "t1", from: "rev", to: "cash", amount: 200, date: new Date(2026, 9, 13), label: "Revolut → Μετρητά" });

  it("is two halves of the same amount, out of one account and into the other", () => {
    expect(out).toMatchObject({ id: "xfer_t1_out", type: "expense", accountId: "rev", amount: 200, transferId: "t1", transferPart: "out" });
    expect(inn).toMatchObject({ id: "xfer_t1_in", type: "income", accountId: "cash", amount: 200, transferId: "t1", transferPart: "in" });
  });

  it("is neither income nor spending", () => {
    for (const half of [out, inn].map((r) => asTx(r, new Date()))) {
      expect(isMoneyMove(half)).toBe(true);
      expect(isSpending(half)).toBe(false);
      expect(isEarning(half)).toBe(false);
    }
  });

  it("moves each account by the amount and leaves the total where it was", () => {
    // Read on the 12th: Eurobank 1.000, Revolut 900, cash 50.
    const reading = readCheckIns([{ id: "c1", at: new Date(2026, 9, 12, 20).toISOString(), amounts: { eb: 1000, rev: 900, cash: 50 } }], accounts, [])[0];
    const halves = [out, inn].map((r) => asTx(r, new Date(2026, 9, 13, 9)));
    const expected = expectedByAccount(accounts, reading, halves);

    expect(expected).toEqual({ eb: 1000, rev: 700, cash: 250 });
    // Second way: the total before and after.
    expect(expected.eb + expected.rev + expected.cash).toBe(1000 + 900 + 50);
  });

  it("is found by its id as a pair, and listed once", () => {
    const halves = [out, inn].map((r) => asTx(r, new Date()));
    const other = { id: "x", type: "expense", amount: 5 } as Transaction;
    expect(transferOf([other, ...halves], "t1")).toEqual({ out: halves[0], in: halves[1] });
    expect(oneRowPerTransfer([other, ...halves]).map((tx) => tx.id)).toEqual(["x", "xfer_t1_out"]);
  });

  it("is refused between an account and itself, without both ends, or without an amount", () => {
    expect(transferProblem({ from: "rev", to: "rev", amount: 10 })).toBe("sameAccount");
    expect(transferProblem({ from: "", to: "cash", amount: 10 })).toBe("noAccount");
    expect(transferProblem({ from: "rev", to: "cash", amount: 0 })).toBe("amount");
    expect(transferProblem({ from: "rev", to: "cash", amount: 0.01 })).toBeUndefined();
  });
});
