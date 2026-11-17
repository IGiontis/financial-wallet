import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// «No change, no Save» — MUST (`.claude/rules/ui.md`; the owner, 2026-11-16:
// he opened several edit forms and could press Save with nothing changed).
//
// Every form that edits a stored record checks through the ONE shared piece,
// `useFormChanged`, and says why Save is off with `UnchangedHint`. Every dialog
// that takes data (`FORM_MODAL`) is either one of those, or listed below as a
// form that only ever makes something new / runs an action — so a new form has
// to be put on one side or the other, in this file, to pass.

const SRC = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

function sources(dir: string): string[] {
  return readdirSync(join(SRC, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(SRC, path)).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** Forms that open a stored record (or a stored value) to change it. */
const EDIT_FORMS = [
  "features/transactions/components/EditTransactionModal.tsx",
  "features/transactions/components/TransferWizard.tsx", // a correction opens on the check
  "features/bills/AddBillModal.tsx", // the bill edit
  "features/bills/BillDetailModal.tsx", // a payment's amount / day, in place
  "features/budget/EditGoalModal.tsx",
  "features/debts/AddDebtModal.tsx", // the loan edit
  "features/debts/DebtCard.tsx", // a repayment's correction, the floating rate's index
  "features/accounts/AccountModal.tsx",
  "features/accounts/EditReadingModal.tsx",
  "features/incomes/components/IncomeFormModal.tsx",
  "features/incomes/components/ThisTimeSheet.tsx", // «Αυτή τη φορά…»: another day / amount
  "features/plannerPage/components/EntryEditor.tsx",
  "features/plannerPage/components/OccurrenceSheet.tsx",
  "features/plannerPage/components/HorizonPicker.tsx",
  "features/categories/CategoryModal.tsx",
  "features/names/PayeeNameModal.tsx", // rename
  "features/business/BusinessWizard.tsx",
  "features/business/ClosingWizard.tsx",
  "features/settings/pages/SettingsPage.tsx", // profile, preferences
];

/** Dialogs that take data but never open a stored record to change it — gated on their required answers instead. */
const NEW_OR_ACTION_ONLY: Record<string, string> = {
  "features/transactions/components/AddTransactionModal.tsx": "a new transaction",
  "features/budget/AddNewGoalModal.tsx": "a new goal",
  "features/budget/ContributionWizard.tsx": "a new deposit / withdrawal",
  "features/bills/MarkPaidModal.tsx": "a new payment",
  "features/bills/SettleOverdueModal.tsx": "new payments for ticked months",
  "features/debts/RepaymentWizard.tsx": "a new repayment",
  "features/debts/ForgiveDebtModal.tsx": "an action on the debt",
  "features/accounts/CheckInModal.tsx": "a new bank reading",
  "features/accounts/GapRecordSheet.tsx": "new records of a difference",
  "features/incomes/components/ArrivedSheet.tsx": "a new income transaction («Ήρθε»)",
  "features/names/CategoryMergeModal.tsx": "an action: merge",
  "features/settings/components/BusinessSetting.tsx": "opens only for the other answer — always a change",
  "features/settings/components/BillAlertSetting.tsx": "saves only its listed changes (`changes.length`)",
  "features/settings/components/ResetDataSection.tsx": "an action: start over",
  "demo/DemoAuthDialog.tsx": "the demo's sign-up",
};

describe("No change, no Save", () => {
  it("every edit form checks through `useFormChanged` and shows `UnchangedHint`", () => {
    const missing = EDIT_FORMS.filter((path) => {
      const code = read(path);
      return !/\buseFormChanged\(/.test(code) || !/<UnchangedHint\b/.test(code);
    });
    expect(missing).toEqual([]);
  });

  it("every dialog that takes data is an edit form above or listed as new-only / an action", () => {
    const withForm = [...sources("features"), ...sources("demo"), ...sources("shared")].filter((path) => /\{\.\.\.FORM_MODAL\}/.test(read(path)));
    expect(withForm.length).toBeGreaterThan(25);
    const unlisted = withForm.filter((path) => !EDIT_FORMS.includes(path) && !(path in NEW_OR_ACTION_ONLY));
    expect(unlisted).toEqual([]);
    // And nothing listed that is gone.
    const gone = [...EDIT_FORMS, ...Object.keys(NEW_OR_ACTION_ONLY)].filter((path) => !withForm.includes(path) && !EDIT_FORMS.includes(path));
    expect(gone).toEqual([]);
  });

  it("no form gates Save on formik's `dirty` or on JSON text — both call «50» ≠ 50 and «a » ≠ «a»", () => {
    const offenders = [...sources("features"), ...sources("shared")].filter((path) => {
      const code = read(path);
      return /\bformik\.dirty\b|\b(profileForm|prefsForm)\.dirty\b/.test(code) || /JSON\.stringify\([^)]*\)\s*[!=]==\s*JSON\.stringify\(/.test(code);
    });
    expect(offenders.map((path) => relative(".", path))).toEqual([]);
  });
});
