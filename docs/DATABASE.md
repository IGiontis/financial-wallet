# Database — Firestore collections, fields, indexes, rules

The map of what MyFiWallet stores in Firestore and how it is read. Read this instead of
re-exploring `src/firebase/`. How data moves (read / save / delete, linked money) is in
`docs/DATA_FLOW.md`; the standing data rules are in `.claude/rules/firestore.md`; the owner's
reasons are in `docs/DECISIONS.md`.

- **Keep it updated in the same change** that adds or changes a collection, a field, an index
  or a rule.
- **The code is the truth**: types in `src/shared/types/IndexTypes.ts`, writers in
  `src/firebase/firestore.ts`, `src/firebase/business.ts`, `src/firebase/names.ts`. If this
  file and the code disagree, the code wins — fix this file.
- Last checked against the code: 2026-11-12.

## Budget: the free plan

- Firebase Spark: **50K reads / 20K writes a day for the whole project**, no Cloud Functions.
  3 users once burned 12–15K reads/day (every app open re-read all transactions).
- How the app stays inside it:
  - **Delta sync** (`src/firebase/syncList.ts`, rules in `src/lib/deltaSync.ts`): each list is
    read whole once per device into IndexedDB, then only `updatedAt > cursor`; a warm start is
    ~1 read per list (an empty answer is billed as 1). Whole re-read weekly, after 60 days
    away, after a reset, or on `SYNC_VERSION` bump.
  - **Firestore's own disk cache** (`persistentLocalCache`, `src/firebase/config.ts`) answers
    offline and survives app close.
  - **Query cache**: `staleTime` 5 min, `gcTime` 30 min, no refetch on window focus
    (`src/lib/queryClient.ts`); saves patch the cache instead of refetching
    (`src/lib/listCache.ts`).
  - **One user-doc read** shared by profile, currency, workspace (`useWorkspace` reuses
    `exchangeRateKeys.user`) and all synced lists (`readUser`, 5 s window, `syncList.ts:32`).
  - **Shared default categories** kept on the device 7 days (`ref:categories-default`,
    `firestore.ts:219`); the seed runs once per device per list revision
    (`categories-seeded-version` in localStorage, `src/firebase/seedCategories.ts`).
  - **Counts on the server** (`getCountFromServer`, 1 read per 1000) for "is this category
    used" (`countCategoryUsage`, `firestore.ts:343`).
  - **Per-user settings on the user doc** (`useWorkspaceSetting`): zero extra reads, writes
    debounced 700 ms.
  - **Pages read only when opened**: e.g. `businessEntries` only on «Δουλειά».
- **Read meter** (dev only): `meterRead()` in `src/lib/readMeter.ts`; totals on
  `window.__reads` and `[reads]` console lines. Off in production and in the demo.
- **Planned, not built** (CLAUDE.md): date-windowed reads and stored monthly totals as data
  grows. Today every synced list is the user's whole collection.

## Shape — conventions for every collection

- Flat, one collection per kind; every document carries `userId` (except `users/{uid}`, keyed
  by uid, and the shared default `categories`, `userId: null`).
- Every write stamps `updatedAt: serverTimestamp()` — the delta sync depends on it. Creates
  also stamp `createdAt`.
- `undefined` is stripped and user text cleaned before every write (`clean` /
  `cleanTextFields`, `firestore.ts:48`). A `null` in an Update DTO means "delete this field"
  (`deleteField()`).
- Ids are usually made on the device first (`newDocId`, `firestore.ts:65`) so the optimistic
  row and the stored doc share an id; some ids are fixed by meaning (transfers `xfer_…`,
  debt cash `debt_…`, `debtpay_…`, `debtint_…`).
- Dates are Firestore Timestamps on the server, `Date` on the device; read through
  `firestoreToDate`.
- Owned collections (account deletion + test): `OWNED_COLLECTIONS` in
  `src/firebase/ownedCollections.ts`.

## Collections

### transactions
- One money record: an expense, income or investment move.
- Fields: `amount` number (positive), `type` `"income" | "expense" | "investment"`,
  `categoryId`, `date`, `description` (the payee), `notes?`, `accountId?` (Banks & cash card;
  absent = main account), `metadata?` (fuel), `inReading?`.
- Link fields (each makes it half of a linked set — see DATA_FLOW "Linked money"):
  - `billId` → bills (expense from paying a bill; payment names it back via `transactionId`)
  - `incomeId`, `incomeDue` "YYYY-MM-DD" → an income definition on the user doc («Ήρθε»)
  - `goalId`, `goalName`, `isGoalTransaction`, `isInvestmentTransaction`, `contributionType`,
    `heldBy?` → mirror of an investmentContributions doc
  - `transferId`, `transferPart` `"out" | "in"` → the other half, ids `xfer_<id>_out/_in`
  - `debtId`, `debtPaymentId?`, `debtPart` `"loan" | "principal" | "interest"` → debt cash,
    ids `debt_<debtId>`, `debtpay_<paymentId>`, `debtint_<paymentId>`
    (`src/features/debts/debtCash.ts:40`)
  - `businessEntryId` + `businessId` → businessEntries (the day's profit/loss) and its business;
    `categoryId` is then always `BUSINESS_CATEGORY_ID` (`"__business__"`, `src/shared/utils/categories.ts`):
    a virtual category shown as «🏪 Δουλειά» / «Business» through `findCategory` / `VIRTUAL_CATEGORIES`
    — no `categories` document, never one of the user's.
- Writers: `firestore.ts` (`createTransaction`, `updateTransaction`, `deleteTransaction`,
  `markBillPaid`, `createContributionWithTransaction`, `createCoveredFunding`,
  `closeInvestmentGoal`, `syncDebtCash`, `saveTransfer`, `deleteTransfer`, `saveGapRecords`,
  `editCoveredDebt`, `cancelCoveredDebt`), `business.ts` (`saveClosing`, `deleteClosing`,
  `deleteBusinessRecords`),
  `names.ts` (payee rename, category merge).
- Read: `getTransactions` → `syncedList("transactions")`; hook `useTransactions`
  (`src/features/transactions/hooks/useTransactions.ts`), key `["transactions", uid]`.
- Other queries: `userId == + goalId ==` (goal delete, contribution delete), `userId == +
  categoryId ==` count, `userId == + businessId ==` (business delete). Equality-only → automatic
  single-field indexes.
- Rules: `type` must be income/expense/investment; `|amount| ≤ 1e9`.

### categories
- One category. Two kinds in one collection:
  - **Shared defaults**: `isDefault: true`, `userId: null`, seeded from
    `src/firebase/defaultCategories.ts` (fixed English names, translated on display). Rules
    let users read them, never write them — the seed's write is refused in production and
    marked done (`seedCategories.ts:61`).
  - **User's own**: `isDefault: false`, `userId: uid`.
- Fields: `name`, `type` (TransactionType), `icon?`, `color?`, `isDefault`, `userId`.
- A "both" category is two docs with one name, one per type, written/renamed/deleted in one
  batch (`createCategories`, `updateCategories`, `deleteCategories`, `firestore.ts:279–320`).
- Writers: `firestore.ts` category functions; `names.ts` (merge deletes the dropped ones last).
  «Δουλειά» never writes here (its records use the virtual `BUSINESS_CATEGORY_ID`).
- Read: `getCategories` (`firestore.ts:244`) = own via `syncedList("categories")` + defaults
  (`isDefault == true`, cached 7 days); merged and de-duplicated by `type-name`. Key
  `["categories", uid]`.
- A category in use is not deleted (UI blocks on `countCategoryUsage`); merging moves the
  records first (`mergeCategoriesEverywhere`, `names.ts`).

### investmentGoals
- One goal (savings) or investment.
- Fields: `name`, `goalType` `"targeted" | "open_ended"`, `targetAmount?`, `targetPeriod?`,
  `deadline?`, `planFrom?` "YYYY-MM-DD", `parts?` `GoalPart[]` (`{id,label,min,max}`, target
  = Σ max), `isActive`, `isCompleted`, `completedAt?`, `icon?`, `color?`, `notes?`.
- Completion is derived on read; adding money writes no goal update.
- Writers: `createInvestmentGoal`, `updateInvestmentGoal`, `deleteInvestmentGoal` (cascade),
  `closeInvestmentGoal` (`firestore.ts:353–432`).
- Read: `syncedList("investmentGoals")`; `useInvestmentGoals`
  (`src/features/budget/useInvestments.ts`), key `["investments", uid, "goals"]`.
- Rules: goal `parts` a list ≤ 50.

### investmentContributions
- One deposit or withdrawal against a goal.
- Fields: `goalId`, `amount`, `contributionType` `"deposit" | "withdrawal"`, `date`, `notes?`,
  `accountId?`, `heldBy?` (handed to a person to keep), `coveredBy?` (a person paid it),
  `debtId?` (the debt that came with `coveredBy`).
- No stored link to its mirror transaction: the mirror is found by `goalId` +
  `contributionType` + `amount` + same `date` ms + `isInvestmentTransaction`
  (`deleteContribution`, `firestore.ts:511`). A `coveredBy` contribution has no mirror.
- Writers: `createContributionWithTransaction`, `createCoveredFunding`, `deleteContribution`,
  `editCoveredDebt`, `deleteCoveredDebt`, goal delete/close.
- Read: `syncedList("investmentContributions")`, all at once (no N+1);
  `useAllContributions`, key `["investments", uid, "contributions"]`.

### budgets
- **Legacy, no longer written.** Kept in `OWNED_COLLECTIONS` because older accounts still have
  documents; cleared by account deletion and by Settings → reset (`RESET_COLLECTIONS`,
  `firestore.ts:912`). The Planner replaced it (DECISIONS: Allocation merged into Planner).
- No type, no reader. Covered by the live rules.

### bills
- One recurring bill.
- Fields: `name`, `amount` (period total; an estimate when `isVariableAmount`), `categoryId`,
  `frequency` `"weekly" | "monthly" | "yearly"`, `intervalCount?`, `anchorDate?`, `dueDay?`,
  `dueMonth?`, `graceDays?`, `installmentCount?`, `installmentIntervalMonths?`, `isActive`,
  `pause?` `{from "YYYY-MM", to?, yearly?}`, `startsOn?` "YYYY-MM", `notes?`, `icon?`, `color?`.
- Writers: `createBill`, `updateBill`, `deleteBill` (`firestore.ts:541–595`); `names.ts`
  (category merge).
- Read: `syncedList("bills")` + `syncedList("billPayments")`, combined into `BillWithStatus`
  by `useBills` (`src/features/bills/useBills.ts`), key `["bills", uid]`
  (`src/features/bills/billCache.ts`).

### billPayments
- One paid period (or instalment) of a bill.
- Fields: `billId`, `periodKey` ("2026-07" / "2026-W30" / "2026"), `installmentIndex?`,
  `amount`, `paidDate`, `transactionId?` (the mirrored expense; absent when settled outside the
  app). Writes stamp `updatedAt` though the type omits it.
- Writers: `markBillPaid` (with its expense), `markBillPeriodsSettled` (no expense, bulk),
  `updateBillPayment`, `unmarkBillPaid`, `updateTransaction`/`deleteTransaction` (via
  `BillPaymentLink`), `deleteBill`.
- Queries: `userId == + billId ==` (bill delete), `userId == + transactionId ==` (find the
  payment of an expense).

### debts
- One loan or IOU with a person.
- Fields: `person`, `direction` `"owed_by_me" | "owed_to_me"`, `amount`, `date`, `dueDate?`,
  `label?`, `interestRate?` (makes it a loan), `termMonths?`, `interestFreeMonths?`,
  `rateType?`, `baseRate?`, `margin?`, `rateReviewedAt?`, `notes?`, `accountId?` (present =
  the debt moves money; `""` = main account), `forGoalId?` + `coveredExpenseId?` (goal paid by
  a friend), `forgiven?` `{date, amount, note?, refund?}`, `inReading?`.
- Writers: `createDebt` (addDoc), `updateDebt`, `editDebt`, `editCoveredDebt`,
  `cancelCoveredDebt`, `deleteDebt`, `deleteCoveredDebt`, `createCoveredFunding`,
  `saveGapRecords` (`firestore.ts:745–1161`).
- Read: `syncedList("debts")` + `syncedList("debtPayments")` together, `useDebts`
  (`src/features/debts/useDebts.ts`), key `["debts", uid]`.
- Kept apart from transactions on purpose: borrowed money is not income. Its money on a card
  is derived transactions (`debtCashRecords`), never typed.

### debtPayments
- One repayment against a debt.
- Fields: `debtId`, `amount`, `date`, `accountId?` (absent = moved nothing), `notes?`,
  `inReading?`.
- Writers: `createDebtPayment`, `updateDebtPayment`, `deleteDebtPayment`, `deleteDebt`,
  `deleteCoveredDebt`, `saveGapRecords`.

### businessEntries
- One «Κλείσιμο ημέρας» (a day's closing) of ONE business, on the «Δουλειά» page. Never in
  production before 2026-11-12 (no old shape to migrate).
- Fields: `businessId` (a business on the user doc, `businesses`), `date`, `incomes`
  `BusinessIncome[]` (`{lineId, amount}`, only amounts > 0, ≤ 30), `expenses` `BusinessExpense[]`
  (`{lineId?, name?, amount, note?}` — a line of the business, or a one-off «άλλο έξοδο» with a
  `name` and no `lineId`; only amounts > 0, ≤ 30), `lineIds?` (distinct line ids of both lists,
  ≤ 60), `notes?`, `accountId?`, `linkedTransactionId?` (the personal income/expense; absent when
  profit = 0). Limits: `LINES_MAX` (`src/features/business/businessKeys.ts`), refused by
  `saveClosing` before writing.
- Figures (`src/features/business/businessSummary.ts`): turnover = Σ incomes, expenses =
  Σ expenses, profit = turnover − expenses, in whole cents.
- Line ids point at lines on the user doc (`businesses`); a rename touches no closing. A line
  taken off a business while closings name it stays there as `removed: true` (names the old
  amounts, not offered in new closings).
- Writers: `saveClosing`, `deleteClosing`, `deleteBusinessRecords` (`src/firebase/business.ts`).
- Read: `syncedList("businessEntries")`, only when the page opens; `useBusinessEntries`
  (`src/features/business/useBusiness.ts`), key `["businessEntries", uid]`.
- Query: `userId == + businessId ==` from the server (business delete). Equality-only →
  automatic indexes.
- **Not in the live rules yet** — PENDING block below (Security rules).

## The `users/{uid}` document

### users

Keyed by the uid (no `userId` field). Read by `getUser` (`firestore.ts:101`) and the sync's
`readUser`. Rules: only that user reads and writes it.

- Profile: `id`, `email`, `username`, `firstName`, `lastName`, `displayName?`, `age?`,
  `country?`, `city?`, `photoUrl?`, `locale`, `currency` (display), `baseCurrency` (set once
  at `createUser`, never changes), `createdAt`, `updatedAt`, `lastLoginAt?`. Written by
  `createUser`/`updateUser` (Settings, `LanguageToggle`).
- `savedPayees?: string[]` — `usePayees`, `renamePayeeEverywhere` (`names.ts`).
- Legacy `openingBalance` / `openingBalanceDate` may remain on old docs; nothing reads them.
- Sync bookkeeping (`syncList.ts:23`):
  - `syncDeletes` — map `"<collection>__<id>"` → ms of deletion; kept 60 days, pruned on read;
    `noteRecreated` removes a key when a fixed id is written again.
  - `syncResetAt` — ms of the last bulk reset; forces whole reads on every device.
- `workspace` — map of per-user settings, one dotted field per key
  (`saveWorkspaceValue`, `firestore.ts:122`), via `useWorkspaceSetting`
  (`src/shared/hooks/useWorkspaceSetting.ts`); localStorage is its device cache. Keys:
  - Planner: `planner-horizon`, `planner-opening`, `planner-opening-source`, `planner-lines`,
    `planner-oneoffs`, `planner-skip`, `planner-occurrences`, `planner-salary`
    (`src/features/plannerPage/plannerInputs.ts:18`, `incomeMigration.ts:38`)
  - Incomes: `incomes` (definitions), `incomes-declined-salary`
    (`src/features/incomes/incomesUtils.ts:34`)
  - Banks & cash: `money-accounts`, `balance-check-ins`
    (`src/features/accounts/accountsUtils.ts:59`)
  - Bill alerts: `bill-alerts`, `bill-alerts-reach`, `bill-alerts-scope`,
    `bill-alerts-by-bill`, `bill-alerts-off`, `bill-alerts-seen`
    (`src/features/bills/useBillAlerts.ts`)
  - Business: `business-on` (feature switch, `FEATURE_KEYS` in `useHasAccess.ts`),
    `businesses` (`Business[]`: `{id, name, incomeLines, expenseLines}`, each line
    `{id, name, removed?}`; ≤ 20 businesses, ≤ 30 offered lines of each kind —
    `src/features/business/businessKeys.ts`, read defensively by `readBusinesses`). All made by
    the user; nothing is seeded. (`business-categories` is gone; it was never in production.)
  - Legacy allocation: `allocation-buckets`, `allocation-moved-to-planner`
    (`allocationMigration.ts:15`)
  - Tour: `tour-seen` (`src/features/tour/tourState.ts`)
- Rule of thumb: small per-user definitions go here (zero extra reads); a growing list of
  records gets its own collection on `syncedList`.

## Indexes

- **Composite (userId ASC, updatedAt ASC)** on every synced list: `transactions`, `categories`,
  `investmentGoals`, `investmentContributions`, `bills`, `billPayments`, `debts`,
  `debtPayments`, `businessEntries`. Without it the changes query fails with
  `failed-precondition`; `syncedList` logs `[sync] <name>: … needs an index` with Firestore's
  one-click link and reads that list whole for the session (`syncList.ts:95–103`).
- The owner was asked to create them in the Console; which exist is not recorded in the
  repo — check the Console or the `[sync]` warning in a dev session.
- All other queries are equality on `userId` + one field → automatic single-field indexes
  (`firestore.ts:391–393`). No query uses `orderBy` or `limit`.
- No `firestore.indexes.json` in the repo; indexes live in the Console like the rules.

## Security rules

**Kept in the Firebase console by the owner, not in the repo** (DECISIONS: no
`firestore.rules` file). A new collection needs a new `match` block handed to the owner, in
the same style, plus its composite index. Until he pastes it, the collection is dead in
production (every read/write `permission-denied`). Live rules as of **2026-11-09**
(from CLAUDE.md):

- `users/{uid}`: read and write only by that user.
- `categories`: read the shared defaults (`isDefault == true`) or your own; create/update only
  your own with `isDefault == false`; delete your own.
- Every other collection (transactions, investmentGoals, investmentContributions, bills,
  billPayments, debts, debtPayments, budgets): read/delete if the stored doc is yours, create
  if the new doc is yours, update if both are (the owner can't change).
- Every write passes `validDoc`: ≤ 80 fields; `amount` a number with |amount| ≤ 1e9;
  description/notes/name/label/person strings ≤ 1000 chars; goal `parts` a list ≤ 50.
  Transactions also need `type` in income / expense / investment (transfers are an income and
  an expense half).
- Anything not listed is denied.

**PENDING — `businessEntries` (NOT live).** The live rules have no block for it, so production
denies every read and write until the owner pastes this one into the console (beside the
other collections' blocks, inside `match /databases/{database}/documents`, where `validDoc` is
defined):

In the live rules' own style (their helpers `ownsExisting()`, `ownsIncoming()` and `validDoc()`
take no arguments — they read `request.resource.data` themselves):

```
function validClosing() {
  let d = request.resource.data;
  return validDoc()
    && d.businessId is string
    && d.incomes is list && d.incomes.size() <= 30
    && d.expenses is list && d.expenses.size() <= 30
    && (!('lineIds' in d) || (d.lineIds is list && d.lineIds.size() <= 60));
}

match /businessEntries/{id} {
  allow read, delete: if ownsExisting();
  allow create: if ownsIncoming() && validClosing();
  allow update: if ownsExisting() && ownsIncoming() && validClosing();
}
```

`validClosing` goes beside `validTransaction` (rules functions sit at the `documents` level).
The live rules were read from the console on 2026-11-12 (read-only) to match their style. Plus the
index **businessEntries: `userId` ASC + `updatedAt` ASC** (delta sync). The personal records
go to `transactions`, already covered (type income/expense, |amount| ≤ 1e9); the businesses
themselves are on `users/{uid}` (already allowed). The page is off by default
(`business-on`), which limits the damage until then.

## Traps

- **Production rules refuse update/delete of a document that does not exist, and that fails
  the WHOLE batch.** Only name documents known to exist. The guard is `stillThere`
  (`firestore.ts:724`): one `getDoc`, "unsure (offline)" counts as there. Used by
  `billPaymentIdsFor`, `updateBillPayment`, `unmarkBillPaid`, `editCoveredDebt`,
  `deleteCoveredDebt`, `saveClosing`, `deleteClosing`. Cascades read their children from the
  server by query instead (`deleteBill`, `deleteInvestmentGoal`, `closeInvestmentGoal`).
  `syncDebtCash` deletes only the ids passed as `existed` (`firestore.ts:843`).
- **The local emulator runs without rules** and hides this; so does the demo's in-memory store
  (`src/demo/memoryFirestore.ts:28`). Tests simulate it with `rules.strictDeletes`
  (`src/firebase/firestore.test.ts`, `business.test.ts`).
- **Batches ≤ 450 ops** (Firestore allows 500): `commitDeletes` (`firestore.ts:78`),
  `commitOps` (`names.ts`). Beyond one chunk, the parent (goal, bill, category) goes last.
- **Account deletion must cover every collection** the app writes: `OWNED_COLLECTIONS`
  (`ownedCollections.ts:17`); `ownedCollections.test.ts` scans the source for every literal
  collection name and fails if one is missing. Flow: `deleteMyAccount`
  (`src/firebase/accountDeletion.ts`) → reauth → `deleteAllUserData` (`firestore.ts:1016`):
  closes the write gate (`deletionGate.ts`), waits ≤ 15 s for queued writes, sweeps every
  owned collection **from the server** until empty (≤ 3 leftover sweeps), then the user doc,
  then clears `sync:<uid>:` on the device. Cost ≈ N + 21 reads, N + 1 deletes. Another open
  tab can still write afterwards (no server-side sweep without Cloud Functions).
  A collection the console rules refuse to read (its block not pasted yet, e.g. a new
  `businessEntries`) counts as empty — nobody could have written there — so it can't sink the
  deletion (`ownedOnServer`, tested in `firestore.test.ts`); any other error still stops it.
- Settings → reset (`resetUserData`, `firestore.ts:925`) is narrower: only the chosen groups
  (transactions; bills+billPayments; goals+contributions; budgets; own categories), then
  `noteReset`. It does not touch debts, debtPayments or businessEntries.
- Writing a field the rules do not allow on the user doc fails silently for the sync log
  (`noteDeletions` catches); devices then catch up at the weekly whole read.
