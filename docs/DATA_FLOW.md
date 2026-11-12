# Data flow — reads, saves, deletes, linked money

How data moves between a screen and Firestore. Read this instead of re-tracing the hooks.
Collections, fields, indexes and rules are in `docs/DATABASE.md`; the standing rules in
`.claude/rules/firestore.md`; the owner's reasons in `docs/DECISIONS.md`.

- **Keep it updated in the same change** that adds a read path, a save, a delete or a link
  between records.
- **The code is the truth**: `src/firebase/*.ts`, `src/lib/listCache.ts`, the feature hooks.
- Last checked against the code: 2026-11-12.

## Read path

    screen → feature hook (useQuery) → TanStack cache ─(miss/stale)→ syncedList
           → IndexedDB copy "sync:<uid>:<name>" + changes since cursor → Firestore

- Hooks: `useTransactions`, `useCategories` (`features/transactions/hooks/useTransactions.ts`),
  `useInvestmentGoals` / `useAllContributions` (`features/budget/useInvestments.ts`),
  `useBills` (`features/bills/useBills.ts`), `useDebts` (`features/debts/useDebts.ts`),
  `useBusinessEntries` / `useBusinesses` (`features/business/useBusiness.ts`), `useWorkspace` /
  `useWorkspaceSetting` (`shared/hooks/useWorkspaceSetting.ts`).
- Data-layer getters (`getTransactions`, `getBills`, … in `src/firebase/firestore.ts`,
  `getBusinessEntries` in `business.ts`) all call `syncedList(name, uid)`
  (`src/firebase/syncList.ts:71`).
- `syncedList`:
  1. reads the device copy (`localGet`, IndexedDB `myfiwallet-local`, `src/lib/localStore.ts`);
  2. if there is a trusted copy (`needsFullSync` false, `src/lib/deltaSync.ts:52`): reads the
     user doc once (shared, 5 s) for the delete log + reset stamp, then queries
     `userId == uid && updatedAt > cursor − 60 s`; merges by id, drops logged deletions
     (`mergeChanges`), saves the copy;
  3. else, or on any error: reads the list whole and stores it.
  An answer `fromCache` (offline) is shown but never advances the cursor.
- Two device caches, two jobs: Firestore's own persistent cache (`config.ts`, offline answers
  and queued writes) and the app's IndexedDB copy (what makes a warm start ~1 read per list).
- TanStack defaults (`src/lib/queryClient.ts`): fresh 5 min, kept 30 min, `retry: 1`, no
  refetch on focus, refetch on reconnect / mount-when-stale.
- Zero-read readers: `useCachedList(key)` / `useCachedData` / `useCachedWorkspaceList`
  (`shared/hooks/useCachedList.ts`) return what the cache holds, never fetch — for name checks
  in forms. `useTransactions({ fetch: false })` only listens (menu badges).
  `useRecordLocks` reads goals from the cache only.
- Workspace settings: first paint from localStorage, then the user doc (`["workspace", uid]`,
  stale 30 min); a device-only value is pushed up once.
- Failed loads (`src/lib/queryAutoRetry.ts`): any errored query still on screen is retried
  silently after 5 s, 15 s, 45 s, 2, 5, 10 min (only while online and visible), and at once on
  `online` / tab visible. **Pages keep their skeleton; never a "didn't load / try again"
  message** (`uiConventions.test.ts` checks).
- Sign-out: `forgetAllLocal()` clears every `sync:` key (`src/firebase/auth.ts:81`).

## Save path (create / edit)

    form wizard review → Save → saveWithoutWaiting(mutation, vars, onFailure)
      → onMutate: editList (optimistic patch, same ids) → mutationFn: firestore.ts (batch)
      → onSuccess: confirmList (patch again, list stays fresh)
      → onError: restoreList (put back + refetch) + toast from onFailure

- `saveWithoutWaiting` (`src/shared/utils/saveWithoutWaiting.ts`): calls `mutate` and returns
  at once — a Firestore write promise only settles when the server answers, so awaiting it
  froze dialogs offline. Cleans user text first.
- Ids: `newDocId(collection)` made on the device, held per vars object by `idsFor`
  (`listCache.ts:225`) so a retry rewrites the same doc instead of a duplicate.
- Cache edits (`src/lib/listCache.ts`): `editList` (skips a never-loaded list), `confirmList`
  (patches; never-loaded → refetch only if on screen), `restoreList`, idempotent
  `upsertById` / `removeWhere`. No `invalidateQueries` after a normal save — refetching a
  list re-reads all of it when Firestore's 30-min resume window has passed.
- Lost write: the mutation's `onError` restores the cache; the `onFailure` toast says so
  (e.g. `goals.depositFailed`, `transactions.saveFailed`). Errors toast 6 s
  (`lib/toastDefaults.ts`).
- Offline: additive saves queue in Firestore's disk cache and survive app close
  (`OfflineAction "entry"`, `shared/utils/offlinePolicy.ts`).
- Every write is confirmed in the UI before it goes: the wizard's review step for new records,
  a before → after summary for edits, `DeleteButton` (`shared/components/DeleteButton.tsx`)
  for deletes, with counts for cascades.
- After a resolved save: `celebrateSave({ collection, id?, milestone? })` and
  `useSavedFlash` on the list (`src/shared/feedback/saveFeedback.ts`; reference:
  `AddTransactionModal`). Costs nothing in Firestore.
- Workspace settings: `setValue` → query cache + localStorage now → `saveWorkspaceValue`
  after 700 ms of quiet (flushed on page hide / unmount), one dotted field
  `workspace.<key>`.

## Delete path

- **Online only.** `requireConnection("delete")` in the data layer throws
  `OfflineActionError` (`offlinePolicy.ts:305`); the screen disables the control with a reason
  through `useOfflineGuard("delete")` (`shared/hooks/useOfflineGuard.ts`). Same for
  `"settings"` (business definitions too) and `"bulk"` (mark many periods paid, rename/merge
  names).
- Deletes are not optimistic in most hooks: rows go in `onSuccess` (`confirmList`).
  Exceptions: `useDeleteTransaction`, `useDeleteTransfer` remove first and restore on error.
- After the batch: `noteDeleted(uid, name, ids)` or, for several lists, `noteDeletions(uid,
  {name: ids})` — ONE write to `users/{uid}.syncDeletes.<name>__<id>` and the rows leave this
  device's copy (`syncList.ts:133–154`). Every delete path must call it, or other devices keep
  the row until their weekly whole read.
- Fixed ids written again (debt cash, a business record re-created) call `noteRecreated` so no
  device drops them.
- Bulk reset (`resetUserData`) writes no log; `noteReset` stamps `syncResetAt` → every device
  reads whole.
- Only name docs known to exist in a batch (see DATABASE.md Traps, `stillThere`).

## Linked money — the dangerous part

Records that describe one fact are written in ONE batch and edited/deleted together. On the
Transactions page their transaction half is locked: `recordLock` / `isFullyLocked`
(`src/features/transactions/linkedRecords.ts`), computed by `useRecordLocks`
(`features/transactions/hooks/useRecordLocks.ts`, no extra read: debts from the shared
`["debts", uid]` query) and explained by `LockNote`
(`features/transactions/components/LockNote.tsx`) with a link to where it is changed.
Lock kinds: `goal`, `debt`, `business` = fully locked; `transfer` = edited/deleted as a pair;
`covered` = amount/date/card/type follow the debt.

### Transfers (between your own accounts)
- Docs: two `transactions`, `xfer_<id>_out` (expense on `from`) and `xfer_<id>_in` (income on
  `to`), same `transferId`, `transferPart`, `TRANSFER_CATEGORY_ID`
  (`features/transactions/transfers.ts:34`). Neither counts as income or spending
  (`isMoneyMove`).
- Write: `saveTransfer` one batch of two `set`s (`firestore.ts:875`); an edit rewrites the same
  two ids, keeping `createdAt`. Hook `useSaveTransfer` (`hooks/useTransfers.ts`), form
  `TransferWizard`.
- Delete: `deleteTransfer` deletes both in one batch + `noteDeleted` (`firestore.ts:884`). If
  one half is already gone the batch is refused; `TransactionPage.tsx:494` deletes an orphan
  half alone with `deleteTransaction`.
- List shows one row per transfer (`oneRowPerTransfer`).
- Tests: `features/transactions/transfers.test.ts`, `firebase/firestore.test.ts` ("deleting
  what is left of a transfer"), `linkedRecords.test.ts`.

### Goal deposits / withdrawals
- Docs: one `investmentContributions` + its mirror `transactions` (`goalId`, `goalName`,
  `contributionType`, `isGoalTransaction` or `isInvestmentTransaction`, `heldBy?`).
- Write: `createContributionWithTransaction`, one batch (`firestore.ts:443`); hook
  `useAddContribution` (`features/budget/useInvestments.ts:245`), optimistic on both lists.
- Link: none stored. The mirror is found by goalId + type + amount + exact date
  (`deleteContribution`, `firestore.ts:511`); exactly one match is deleted.
- Delete one: `deleteContribution` — query mirrors, batch-delete contribution + mirror.
- Delete goal: `deleteInvestmentGoal` — queries contributions and mirrors from the server,
  deletes them, goal LAST (`firestore.ts:397`), one log write.
- Close goal (money spent): `closeInvestmentGoal` — one batch writes the closing transactions
  (`closingRecords`, `features/budget/goalHolding.ts:100`), deletes contributions + goal;
  mirrors are KEPT as history (`firestore.ts:420`).
- Locked: the mirror (`goal`), changed only from the goal.
- Tests: `features/budget/useInvestments.test.tsx`, `firebase/firestore.test.ts`
  (deleteInvestmentGoal, deleteContribution), `goalHolding.test.ts`, `ContributionWizard.test.tsx`.

### Goal paid by a friend ("covered")
- Docs, one batch (`createCoveredFunding`, `firestore.ts:484`): `investmentContributions`
  (`coveredBy`, `debtId`, no mirror), `debts` (`direction "owed_by_me"`, `forGoalId`,
  `coveredExpenseId`, `accountId: ""`), `transactions` expense (what was bought). Built by
  `coveredFundingVars` (`features/budget/coveredFunding.ts:17`), from the goal wizard or the
  debt form. Ids fixed up front (`useCoveredFunding`).
- Then a SECOND write: `sync(debtId)` writes the debt's loan record `debt_<debtId>` on the
  main account, which cancels the expense there — no card moves. A failure is healed by
  `useHealDebtCash` on the next Debts visit.
- Edit: `editCoveredDebt` — debt + contribution + expense in one batch, each read first with
  `stillThere` (`firestore.ts:1106`); the plan from `coveredEdit` (`coveredLink.ts:142`).
- Call off (refund): `cancelCoveredDebt` — debt gets `forgiven {refund: true}`, loses
  `accountId`, expense deleted in the same batch (`firestore.ts:786`); `useCancelCoveredDebts`
  then syncs the cash away.
- Delete: `deleteCoveredDebt` — repayments + contribution + expense + debt, the two links only
  if `stillThere` (`firestore.ts:1141`).
- Locked: the expense (`covered`; payee locked when the debt does not name it — older debts
  found it by figures, `coveredExpenses` in `coveredLink.ts:46`).
- Tests: `coveredRefund.test.ts`, `coveredLink.test.ts`, `useCoveredLink.test.tsx`,
  `coveredDebt.demo.test.ts`, `features/debts/AddDebtModal.goal.test.tsx`.

### Debts and repayments → their cash
- Docs: `debts`, `debtPayments`, and DERIVED `transactions` with fixed ids
  `debt_<debtId>` (loan, `debtPart "loan"`), `debtpay_<paymentId>` (principal),
  `debtint_<paymentId>` (interest) — only when the debt/repayment names a card
  (`accountId`, `""` = main). Loan + principal are transfers; interest is spending/income.
  (`features/debts/debtCash.ts`)
- **Two writes, not one batch**: the debt/repayment is saved, then `useDebtRefresh().sync`
  re-reads debts and calls `syncDebtCash(uid, records, remove, existed)` (`firestore.ts:843`):
  `set` every wanted record, delete only `existed` ids, then `noteRecreated` +
  `noteDeleted`. A failure of the second write is a warning toast (`debts.moneyLater`), healed
  by `useHealDebtCash` (`debtCashDrift`) once per Debts visit (`useDebts.ts`, `DebtsPage.tsx:43`).
- Delete debt: `deleteDebt` — repayments + debt in one batch (`firestore.ts:795`), then
  `clear(allDebtCashIds(...))` removes the cash.
- Locked: every cash record (`debt`), changed on «Χρέη & δάνεια».
- Bank-reading gap records may create debts / repayments / their cash in ONE batch
  (`saveGapRecords`, `firestore.ts:1064`) — the one place debt cash is not a second write.
- Tests: `features/debts/debtCash.test.ts`, `firebase/firestore.test.ts` (syncDebtCash),
  `debtsUtils.test.ts`, `features/accounts/gapRecords.test.ts`, `firebase/syncEveryList.test.ts`.

### Bill payments
- Docs: `billPayments` (`transactionId`) + `transactions` expense (`billId`), one batch
  (`markBillPaid`, `firestore.ts:608`; hook `useMarkBillPaid`, `useBills.ts:163`).
- Settled outside the app: `markBillPeriodsSettled` — payments only, no expense, bulk, online
  only (`firestore.ts:694`).
- Edit from Bills: `updateBillPayment` — payment + expense (only if `stillThere`) in one
  batch. Edit from Transactions: `updateTransaction` with a `BillPaymentLink` updates the
  payment's amount/paidDate in the same batch (`firestore.ts:168`).
- Undo: `unmarkBillPaid` — payment + expense (if there). Delete expense from Transactions:
  `deleteTransaction` takes the payment too (looked up by `transactionId`, or `stillThere`).
- Delete bill: payments go (queried from the server), the bill LAST; their **expenses stay**
  as real spending with a dangling `billId` (`deleteBill`, `firestore.ts:585`).
- Not locked on Transactions: a bill expense is editable there and carries its payment along.
- Tests: `features/bills/useBills.test.tsx`, `transactions/hooks/useTransactions.test.tsx`
  ("a bill's expense"), `firebase/firestore.test.ts` (deleteBill, "a bill payment whose
  expense is gone", updateTransaction, deleteTransaction).

### Business closing → personal transaction
- Businesses (name, income lines, expense lines) live on the user doc (`businesses`,
  `useBusinesses`), written by `BusinessWizard` through `useWorkspaceSetting` — zero reads,
  one debounced write. A rename touches no closing (lines are named by id).
- Docs, one batch (`saveClosing`, `src/firebase/business.ts`): `businessEntries`
  (`linkedTransactionId`) + `transactions` (`businessEntryId`, `businessId`): an income of the
  profit, or an expense of a loss; none when profit = 0. Built by `personalRecord`
  (`features/business/businessSummary.ts`): `categoryId` = `BUSINESS_CATEGORY_ID` (virtual,
  «🏪 Δουλειά»), description «Κέρδος · <business>» / «Ζημιά · <business>»; `saveClosing`
  forces the category and `businessId` again. No `categories` document is ever written.
- Edit: the previous record is read (`stillThere`): there → updated (type may flip, business
  and description follow the closing); gone → re-`set` under its id + `noteRecreated`; no longer
  wanted → deleted only if there.
- Delete a closing: `deleteClosing` — entry + record (if there) in one batch, one log write.
- Delete a business: `deleteBusinessRecords` — `userId == + businessId ==` read FROM THE SERVER
  on both `businessEntries` and `transactions` (only existing docs are named), each closing in
  the same batch as its record, ≤ 450 deletes a batch, one log write (also on a part-way failure,
  for what did go; the error carries `deleted`). Then `useDeleteBusiness` removes the business
  from the user doc LAST. The confirmation's counts come from the closings on the device
  (`businessReach`), no read. Cost: N + M reads, N + M deletes, 1 log write, 1 user-doc write.
- Taking a line off a business: no closing is rewritten; a line closings name stays as
  `removed: true` (`buildBusiness`, `features/business/businessEdit.ts`).
- Hooks: `useSaveClosing` / `useDeleteClosing` / `useDeleteBusiness`
  (`features/business/useBusiness.ts`), forms `ClosingWizard.tsx`, `BusinessWizard.tsx`.
- Locked: the personal record (`business`), changed only on «Δουλειά».
- Tests: `firebase/business.test.ts` (strict-delete rules simulated, cascade chunks and
  part-way failure), `firebase/syncBusiness.test.ts`, `features/business/businessSummary.test.ts`,
  `businessEdit.test.ts`, `businessRecord.test.ts` (category display, counted once),
  `demo/fixtures.test.ts`.

### Incomes «Ήρθε»
- Income definitions live on the user doc (`workspace.incomes`); «Ήρθε» writes one
  `transactions` income with `incomeId` + `incomeDue` (`arrivalTransaction`,
  `useRecordArrival`, `features/incomes/useIncomes.ts:163`).
- Undo: each record deleted with `useDeleteTransaction` (separate writes, not one batch) and
  the `planner-occurrences` override cleared (`useUndoArrival`, `useIncomes.ts:179`).
- Not locked: deleting the transaction takes the «Ήρθε» back everywhere.
- Tests: `features/incomes/IncomesPage.test.tsx`, `useSalaryIncome.test.tsx`.

### Names: payee rename, category merge
- `renamePayeeEverywhere`, `mergeCategoriesEverywhere` (`src/firebase/names.ts`): update every
  record id held on the device, ≤ 450 per batch, the user doc / dropped categories LAST.
  Bulk/delete → online only. Tests: `firebase/names.test.ts`.

## Demo mode — zero Firebase calls

- Unknown devices start in the demo (`startsInDemo`, `src/demo/demoMode.ts`; never on
  `/login`, `/register`, `/terms`, `/privacy`). Decided once per page load.
- Every Firestore function comes from `src/firebase/firestoreApi.ts`, which routes to
  `src/demo/memoryFirestore.ts` in the demo — so `firestore.ts` runs unchanged on an in-memory
  map. `config.ts` hands out throwing stand-ins for Auth/Firestore in the demo.
- Seeded by `seedDemo` (`src/demo/demoSession.ts`) from `demoData` / `demoCollections`
  (`src/demo/fixtures.ts`), built through the app's own writers' shapes (period keys,
  `transferRecords`, `debtCashRecords`, `coveredFundingVars`, `personalMove`). Language
  change reseeds; refresh starts over.
- Nothing persists: `localStore` and the workspace cache are no-ops / in-memory in the demo;
  `readMeter` counts nothing.
- The in-memory store is more forgiving than production: deleting a missing doc succeeds and
  there are no rules — never use the demo to rule out the batch trap.
- **Every new collection or field needs fixtures in `src/demo/fixtures.ts`**;
  `fixtures.test.ts` keeps the figures consistent. Guards: `demoSafety.test.ts` (no real SDK
  call), `demoIsolation.test.tsx`, `memoryFirestore.test.ts`.
- Every new Firestore call must go through `firestoreApi.ts`, never `firebase/firestore`
  directly.
