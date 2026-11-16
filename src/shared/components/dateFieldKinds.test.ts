import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Every date field in the app, sorted into the two kinds the owner named
// (2026-11-14, .claude/rules/ui.md «Forms and records»):
//
//   HAPPENED — a transaction, transfer, deposit, payment, repayment, «Ήρθε», a
//   reading's record, a closing: today or earlier. The field carries
//   `happened` (the calendar greys out the days after today) and the form
//   checks the value with `happenedDayError` / `isAfterToday` from
//   `shared/utils/dates.ts`.
//   PLANNED — a due day, a schedule, a deadline, a planner line, a pause, a
//   filter: may be in the future, no `happened`.
//
// A new `<DateField>` anywhere fails this test until it is added below with its
// kind — so a new "happened" form cannot forget the rule. Counts per file.

const SRC = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** file → how many of its `<DateField>`s are each kind. */
const KINDS: Record<string, { happened: number; planned: number }> = {
  // Happened
  "features/transactions/components/AddTransactionModal.tsx": { happened: 1, planned: 0 }, // new transaction (page, dialog, quick add)
  "features/transactions/components/EditTransactionModal.tsx": { happened: 1, planned: 0 }, // edit, incl. «Ήρθε» corrections
  "features/transactions/components/TransferWizard.tsx": { happened: 1, planned: 0 },
  "features/budget/ContributionWizard.tsx": { happened: 1, planned: 0 }, // deposit, withdrawal, «πλήρωσε για μένα», spent
  "features/bills/MarkPaidModal.tsx": { happened: 1, planned: 0 }, // «Πληρώθηκε»
  "features/bills/BillDetailModal.tsx": { happened: 1, planned: 0 }, // a payment's correction
  "features/debts/RepaymentWizard.tsx": { happened: 1, planned: 0 },
  "features/debts/PersonDebtsModal.tsx": { happened: 1, planned: 0 }, // a repayment's correction
  "features/debts/ForgiveDebtModal.tsx": { happened: 1, planned: 0 },
  "features/incomes/components/ArrivedSheet.tsx": { happened: 1, planned: 0 }, // «Ήρθε»
  "features/accounts/GapRecordSheet.tsx": { happened: 1, planned: 0 }, // a bank difference's records
  "features/business/ClosingWizard.tsx": { happened: 1, planned: 0 },
  // Both: the day a debt began happened; its due date is a plan.
  "features/debts/AddDebtModal.tsx": { happened: 1, planned: 1 },
  // Planned
  "features/bills/AddBillModal.tsx": { happened: 0, planned: 4 }, // anchor month, starts on, pause from / to
  "features/budget/components/GoalWizard.tsx": { happened: 0, planned: 1 }, // deadline
  "features/budget/components/PlanFromField.tsx": { happened: 0, planned: 1 },
  "features/incomes/components/IncomeFormModal.tsx": { happened: 0, planned: 4 }, // start, pause from / to, end
  "features/incomes/components/ThisTimeSheet.tsx": { happened: 0, planned: 1 }, // the day one income is expected
  "features/plannerPage/components/EntryEditor.tsx": { happened: 0, planned: 5 },
  "features/plannerPage/components/OccurrenceSheet.tsx": { happened: 0, planned: 1 },
  "features/transactions/components/TransactionCalendar.tsx": { happened: 0, planned: 1 }, // a filter's range, not a record
};

/** Forms whose «happened» check is their own, same rule: the gap's `gapRecordProblem` («accounts.gap.noFuture»). */
const OWN_CHECK = new Set(["features/accounts/GapRecordSheet.tsx"]);

const found = files(SRC)
  .map((path) => {
    const text = readFileSync(path, "utf8");
    const tags = [...text.matchAll(/<DateField\b([\s\S]*?)\/>/g)].map((m) => m[1]);
    const happened = tags.filter((attrs) => /(^|\s)happened(\s|=|$)/.test(attrs)).length;
    return { path: relative(SRC, path).replace(/\\/g, "/"), text, happened, planned: tags.length - happened };
  })
  .filter((f) => f.happened + f.planned > 0 && f.path !== "shared/components/DateField.tsx");

describe("every date field is sorted into happened / planned", () => {
  it("lists exactly the files that have one, with their counts", () => {
    const actual = Object.fromEntries(found.map((f) => [f.path, { happened: f.happened, planned: f.planned }]));
    expect(actual).toEqual(KINDS);
  });

  it("a form with a «happened» field also checks the value, not only the calendar", () => {
    for (const f of found.filter((x) => x.happened > 0 && !OWN_CHECK.has(x.path))) {
      expect(/\b(happenedDayError|isAfterToday)\b/.test(f.text), `${f.path} checks a future day in its validation`).toBe(true);
    }
  });
});
