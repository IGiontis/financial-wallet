import { describe, it, expect } from "vitest";
import type { Debt, DebtPayment, Transaction } from "../../shared/types/IndexTypes";
import { isDebtTransfer, isEarning, isSpending } from "../../shared/utils/moneyModel";
import { balanceDelta } from "../../shared/utils/balance";
import { computeDebtStatus, loanSplits } from "./debtsUtils";
import { DEBT_INTEREST_CATEGORY_ID, debtCashIds, debtCashRecords } from "./debtCash";

// The money a debt moves through a card. Borrowing 1.000 into Revolut puts
// 1.000 on Revolut and earns nothing; paying 100 back takes 100 off it and
// spends nothing; a loan's interest is the one part that is a cost.

const JAN = new Date(2026, 0, 10);
const debt = (over: Partial<Debt> = {}): Debt =>
  ({ id: "d1", userId: "u", person: "Giorgos", direction: "owed_by_me", amount: 1000, date: JAN, createdAt: JAN, updatedAt: JAN, ...over }) as Debt;
const pay = (id: string, amount: number, date: Date, accountId?: string): DebtPayment => ({ id, userId: "u", debtId: "d1", amount, date, createdAt: date, ...(accountId !== undefined ? { accountId } : {}) });
const status = (d: Debt, payments: DebtPayment[]) => computeDebtStatus(d, payments, new Date(2026, 9, 7));
const asTx = (r: ReturnType<typeof debtCashRecords>["records"][number]) => ({ ...r, userId: "u", updatedAt: r.createdAt }) as Transaction;

describe("a debt between people", () => {
  it("borrowed into a card: the card gains it, and it is neither earned nor spent", () => {
    const { records } = debtCashRecords(status(debt({ accountId: "revolut" }), []));
    expect(records).toHaveLength(1);
    const [loan] = records;
    expect(loan).toMatchObject({ id: debtCashIds.loan("d1"), type: "income", amount: 1000, accountId: "revolut", debtPart: "loan" });
    const tx = asTx(loan);
    expect(balanceDelta(tx)).toBe(1000);
    expect(isDebtTransfer(tx)).toBe(true);
    expect(isEarning(tx)).toBe(false);
    expect(isSpending(tx)).toBe(false);
  });

  it("lent from the main account: it leaves, and is not spending", () => {
    const { records } = debtCashRecords(status(debt({ direction: "owed_to_me", accountId: "" }), []));
    const tx = asTx(records[0]);
    expect(tx.type).toBe("expense");
    expect(tx.accountId).toBeUndefined();
    expect(balanceDelta(tx)).toBe(-1000);
    expect(isSpending(tx)).toBe(false);
  });

  it("a repayment from a card takes all of it off the card, as principal", () => {
    const { records } = debtCashRecords(status(debt({ accountId: "revolut" }), [pay("p1", 100, new Date(2026, 1, 10), "eurobank")]));
    const repayment = records.find((r) => r.debtPart === "principal")!;
    expect(repayment).toMatchObject({ id: debtCashIds.principal("p1"), type: "expense", amount: 100, accountId: "eurobank", debtPaymentId: "p1" });
    expect(balanceDelta(asTx(repayment))).toBe(-100);
    expect(isSpending(asTx(repayment))).toBe(false);
  });

  it("money paid back to me comes into the card", () => {
    const { records } = debtCashRecords(status(debt({ direction: "owed_to_me", accountId: "" }), [pay("p1", 250, new Date(2026, 1, 10), "")]));
    expect(balanceDelta(asTx(records.find((r) => r.debtPart === "principal")!))).toBe(250);
  });
});

describe("what was there before", () => {
  it("a debt and repayments saved without a card move nothing, as they never did", () => {
    const { records, remove } = debtCashRecords(status(debt(), [pay("p1", 100, new Date(2026, 1, 10))]));
    expect(records).toEqual([]);
    // And anything a card once wrote for them goes.
    expect(remove).toEqual([debtCashIds.loan("d1"), debtCashIds.principal("p1"), debtCashIds.interest("p1")]);
  });

  it("a new repayment on an old debt moves its own money only", () => {
    const { records } = debtCashRecords(status(debt(), [pay("p1", 100, new Date(2026, 1, 10), "revolut")]));
    expect(records.map((r) => r.debtPart)).toEqual(["principal"]);
  });
});

describe("a loan with interest", () => {
  const loan = debt({ amount: 10000, interestRate: 6, termMonths: 24, accountId: "revolut" });
  const payments = [pay("p1", 443.21, new Date(2026, 1, 10), "revolut"), pay("p2", 443.21, new Date(2026, 2, 10), "revolut")];

  it("divides each repayment into the debt and its interest, the two adding up to the payment", () => {
    const s = status(loan, payments);
    const { records } = debtCashRecords(s);
    const splits = loanSplits(s, new Date(2026, 9, 7))!;
    for (const p of payments) {
      const principal = records.find((r) => r.id === debtCashIds.principal(p.id))!;
      const interest = records.find((r) => r.id === debtCashIds.interest(p.id))!;
      // The second way: the loan sheet's own split, and the payment itself.
      expect(interest.amount).toBe(splits.get(p.id)!.interest);
      expect(Math.round((principal.amount + interest.amount) * 100) / 100).toBe(p.amount);
      expect(interest.categoryId).toBe(DEBT_INTEREST_CATEGORY_ID);
    }
    // 10.000 × 6% × 31/365 ≈ 50,96 of interest in the first month.
    expect(records.find((r) => r.id === debtCashIds.interest("p1"))!.amount).toBeCloseTo(50.96, 1);
  });

  it("counts the interest as spending, and only the interest", () => {
    const { records } = debtCashRecords(status(loan, payments));
    const spent = records.map(asTx).filter(isSpending);
    expect(spent.every((tx) => tx.debtPart === "interest")).toBe(true);
    expect(spent).toHaveLength(2);
  });

  it("on money lent at interest, the interest is income", () => {
    const { records } = debtCashRecords(status({ ...loan, direction: "owed_to_me" }, payments));
    const interest = asTx(records.find((r) => r.debtPart === "interest")!);
    expect(isEarning(interest)).toBe(true);
    expect(balanceDelta(interest)).toBeGreaterThan(0);
  });
});
