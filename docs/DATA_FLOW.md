# Data flow — reads, saves, deletes, linked money

How data moves between a screen and Firestore. Read this instead of re-tracing the hooks.
Collections, fields, indexes and rules are in `docs/DATABASE.md`; the standing rules in
`.claude/rules/firestore.md`; the owner's reasons in `docs/DECISIONS.md`.

- **Keep it updated in the same change** that adds a read path, a save, a delete or a link
  between records.
- **The code is the truth**: `src/firebase/*.ts`, `src/lib/listCache.ts`, the feature hooks.
- Last checked against the code: 2026-11-12 (run-once guard and toasts added the same day).

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
- Sign-out: `forgetAllLocal()` clears every `sync:` key (`logout`, `src/firebase/auth.ts`); the menu's
  sign-out (`signOutToDemo`) also clears the account's localStorage keys (`forgetAccountStorage`) and
  lands on the public demo with a full page load.

## Every write runs once, and says how it went

The owner's report (2026-11-12): «delete goal» pressed again while the first delete ran sent a second
batch naming the documents the first had just deleted; production rules refuse a delete of a missing
doc and fail the whole batch → an error toast for a goal that was gone (reproduced in
`firebase/firestore.test.ts`, "run twice"). Two locks now, one per layer:

- **Data hook**: every mutation is `useOnceMutation` (`shared/hooks/useOnceMutation.ts`), never TanStack's
  `useMutation` (`shared/hooks/actionsRunOnce.test.ts`). `onceBy` (required) names what makes two calls the
  same action: the record for deletes / online-only changes — a second call while the first is in flight
  starts nothing and hears the first one's answer; `sameCall` (the same vars object) for optimistic saves,
  where two equal saves are two records. Bill «Πληρώθηκε» is keyed by bill + period + instalment.
- **Screen**: the button that started it is locked until the answer — `DeleteButton` / `ConfirmSheet` /
  `GoalDeleteModal` wait for the promise their handler returns; anything else uses `useRunOnce` (a ref, so a
  double-click is refused before React draws `disabled`). While it runs: «Διαγραφή…» / «Αποθήκευση…», every
  other button disabled, no ✕, no Esc, static backdrop. A closing dialog takes no presses
  (`theme.css`, `.modal.fade:not(.show) .modal-content`).
- **The screen never hangs** (the owner, 2026-11-13: a Save sat locked 15 s on his iPhone, no toast, over a
  record that had been saved — handlers awaited `mutateAsync`, and a Firestore write promise settles only on
  the SERVER's acknowledgement). Two kinds of write, two rules:
  - **New / edit** never wait: `saveWithoutWaiting` — optimistic cache patch (rows everywhere at once), the
    dialog closes, success toast + `celebrateSave` at once; a later refusal → the hook's `onError` puts the
    cache back + the `onFailure` toast (hung off the write's own promise, so it is said after the dialog has
    gone). Batched linked writes (bill payment, goal deposit/withdrawal, covered funding, repayment, gap
    records, business closing, transfer, «Ήρθε») included.
  - **Online-only** (deletes, bulk, reset, merges, rename everywhere, business delete, closing a goal, «Ήρθε»
    undone): `answerOrLetGo(work, { records, succeeded, failed, close })` (`shared/utils/pendingRecords.ts`) —
    the dialog stays locked while it runs, **7 s at most** (`LET_GO_MS`): then it closes with the info toast
    `toasts.stillRunning` («Συνεχίζει — θα σου πούμε μόλις γίνει»), the records stay marked pending (rows
    `.row-pending`, actions disabled — `usePendingRecords`, built into `useSavedFlash`), and the real outcome
    comes as a success/error toast when it settles (the mark clears then). On time: success → toast + close;
    failure → error toast, the dialog as it was.
  - **Pending marks** (`pendingRecords.ts`): `"action"` for an online-only action, `"save"` for a save not yet
    acknowledged (`saveWithoutWaiting(…, records)`). Lists disable a record on `"action"`; the Overview's
    clickable items (attention rows for bills/debts, goal cards, the bill timeline) on either (the owner's
    ask). Costs nothing in Firestore.
  - `actionsRunOnce.test.ts` checks: no `await x.mutateAsync` / `.then` in screens; every `mutateAsync` left is a
    delete/remove/merge/rename/close inside `answerOrLetGo`; no `mutate(…, { onSuccess/onError })`.
- **Honest answer**: success toast only after it went, an error toast saying what did not happen. Deletes are
  not applied to the lists until the server agrees (except `useDeleteTransaction` / `useDeleteTransfer`, which
  put the row back on error). Never `mutate(…, { onSuccess })`: TanStack drops those callbacks when the
  component unmounts or a second `mutate` is made.
- **A toast after every new / edit / delete** (`.claude/rules/ui.md`). Plain wording under `toasts.*` in the
  locales; durations from `lib/toastDefaults.ts`. `celebrateSave` does not toast — a form that celebrates still
  toasts once. Debt hooks toast their own failures (`debts.saveFailed` / `debts.deleteFailed`), the screens
  only the success. A refused workspace write (`useWorkspaceSetting`) toasts `toasts.settingNotSaved`.

## Save path (create / edit)

    form wizard review → Save → saveWithoutWaiting(mutation, vars, onFailure)
      → onMutate: editList (optimistic patch, same ids) → mutationFn: firestore.ts (batch)
      → onSuccess: confirmList (patch again, list stays fresh)
      → onError: restoreList (put back + refetch) + toast from onFailure

- `saveWithoutWaiting(mutation, vars, onFailure?, records?)` (`src/shared/utils/saveWithoutWaiting.ts`):
  starts `mutateAsync` and returns at once — a Firestore write promise only settles when the server
  answers, so awaiting it froze dialogs offline and held one 15 s on an iPhone. Cleans user text first;
  `onFailure` hangs off the write's promise (survives the dialog unmounting); `records` are marked `"save"`
  pending until acknowledged (the Overview waits on them).
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
- The success toast of an optimistic save fires when the local write is applied (the dialog closes then); a
  lost write still restores the lists and toasts through `onFailure`. A double Save cannot fire twice: formik's
  `isSubmitting` / a `saving` state set in the click disables it, and the dialog is gone or inert at once.
- No save waits for the server any more (2026-11-13). The ones that used to — debts (create/edit, with
  their covered goal deposit/expense), repayments (record/correct), «Χαρίστηκε» and its undo, the rate update,
  categories (create, edit, widen to «both»), gap records, goal pause/edit, profile/preferences — now patch
  the cache first: `useDebtRefresh().preview` puts the debt and the money it moves (`debtCashRecords`) on
  screen as the post-save `sync` will write it; `createDebt` / `createDebtPayment` / `createCategories` take
  a device-made id (`newDocId`, `newCategoryIds`) so the row on screen is the one stored; `useSaveGapRecords`
  puts its transactions and debts in; `useUpdateGoal` / `useUpdateCategoryGroup` merge the fields. All roll
  back on a refusal.
- After a resolved save: `celebrateSave({ collection, id?, milestone? })` and
  `useSavedFlash` on the list (`src/shared/feedback/saveFeedback.ts`; reference:
  `AddTransactionModal`). Costs nothing in Firestore.
- Workspace settings: `setValue` → query cache + localStorage now → `saveWorkspaceValue`
  after 700 ms of quiet (flushed on page hide / unmount), one dotted field
  `workspace.<key>`.

### No change, no write (the owner, 2026-11-16)

He opened edit forms and could press Save with nothing changed. Two locks, one per layer:

- **Screen**: every edit form compares what it holds with what it opened with through
  `useFormChanged` (`shared/hooks/useFormChanged.ts`, by meaning — `shared/utils/sameValues.ts`: trimmed text,
  numbers as numbers, dates as days, empty = absent). Unchanged → Save (and the review's Save) disabled with
  «Δεν άλλαξε τίποτα» (`UnchangedHint`), and the handler returns before any toast. Changing a value back
  disables it again. `noChangeNoSave.test.ts` lists the edit forms and checks each one uses it.
- **Data layer**: every update hook declares `unchangedWhen` on `useOnceMutation` — the update's fields compared
  with the record in the cached list (`sameAsStored`, zero reads). Equal → the call resolves at once and runs
  NOTHING: no `onMutate` cache patch, no Firestore write (it would still bump `updatedAt` and send the record to
  every device by the delta sync), no `onSuccess`. Hooks: `useUpdateTransaction`, `useUpdateCategoryGroup`,
  `useUpdateBill`, `useUpdateBillPayment` (nothing given also counts), `useUpdateGoal`, `useUpdateDebt`, `useEditDebt`
  (with no goal money to correct), `useUpdateRepayment`, `useSaveTransfer` (a correction whose two halves are stored
  so), `useSaveClosing` (a correction whose closing and personal record are stored so). A record not in the cache is
  never judged unchanged (the write goes). Workspace values (`useWorkspaceSetting`): a value equal to the held one,
  as exact JSON (a value may hold a moment, where «the same day» is not the same), is not sent — unless its last
  write was refused. The profile and preferences forms (Settings) check before `updateUser`.
- Each net compares the update **as its writer writes it**: `forUpdate` writers (`updateTransaction`, `updateBill`,
  `updateInvestmentGoal`, `updateDebt`, `updateCategories`, `updateUser`; `updateDebtPayment`'s optional fields) leave an
  `undefined` field as stored, so it is not compared, while `null` (take it off) must match an absent field — so a
  cleared field that IS stored counts as a change and is written;
  `updateTransaction` always writes `metadata` (none = taken off), and `editDebt` takes off every optional field the
  form leaves empty (`debtEdit`) — both compared as such. Dates are compared as days (no form edits an hour).

### Clearing a field (2026-11-16)

Emptying an optional field in an edit form (a note, an icon, a goal's deadline, a bill's due month, a city) must take
it off the stored document — not leave the old value there to come back with the next sync. One rule, the same on
both sides of the save:

- **The form says it**: an edit form sends `null` for an optional field the user emptied, and leaves out
  (`undefined`) a field it does not show or did not touch. Never guess «cleared» from `undefined`.
  Forms: `EditTransactionModal` (notes), `EditGoalModal` (icon, colour, notes, deadline, plan-from, parts),
  `AddBillModal` on an edit (notes, due month, pause, start month), Settings profile (age, city, country).
  The update DTOs type these fields `T | null` (`IndexTypes.ts`).
- **The write**: `forUpdate` (`src/firebase/firestore.ts`) — `undefined` left out, `null` → `deleteField()`,
  anything else written with user text cleaned and no `undefined` at any depth. Used by `updateTransaction`,
  `updateCategories` / `updateCategory`, `updateInvestmentGoal`, `updateBill`, `updateDebt`, `updateUser`.
  `updateTransaction` also always speaks for `metadata` (fuel): none takes it off.
- **The cache patch**: `mergeFields` (`src/lib/listCache.ts`) applies the same rule to the cached row — `null`
  deletes the key, `undefined` keeps the old value — in `applyTransactionUpdate`, `useUpdateCategoryGroup`,
  `useUpdateGoal`, `applyBillUpdate`, `useUpdateDebt` and the Settings profile; so the screen and the server agree.
- **Already explicit, unchanged**: `editDebt` / `editCoveredDebt` take off every optional loan field the form leaves
  empty (`debtEdit`); `updateDebtPayment` (`accountId: null`, empty note); `saveClosing` (notes, card, link);
  transfers and debt cash are written whole (`set`), so a cleared field is simply not in the new document.
- **Workspace values** (accounts, planner lines, incomes, businesses, check-ins …) are written whole per key
  (`saveWorkspaceValue`): a field left off an entry is gone from the server too. Nested `undefined` is stripped
  (`withoutUndefinedDeep`) — Firestore would refuse the whole write for it — and a value of `undefined` deletes the key.
- **Rules**: the live `validDoc` checks only the fields present (types, sizes, ≤ 80 fields), so deleting a field
  passes; production already deleted fields this way before (a pause, a forgiveness, a card, a goal's parts).
  `type` and `amount` are never cleared.
- Tests: `src/firebase/clearFields.test.tsx` (each writer against the demo's in-memory store, which applies
  `deleteField()` and refuses an update of a missing document; and the hooks — cache and store agree).

## Delete path

- **Online only.** `requireConnection("delete")` in the data layer throws
  `OfflineActionError` (`offlinePolicy.ts:305`); the screen disables the control with a reason
  through `useOfflineGuard("delete")` (`shared/hooks/useOfflineGuard.ts`). Same for
  `"settings"` (business definitions too) and `"bulk"` (mark many periods paid, rename/merge
  names).
- Deletes are not optimistic in most hooks: rows go in `onSuccess` (`confirmList`).
  Exceptions: `useDeleteTransaction`, `useDeleteTransfer` remove first and restore on error.
- Every delete runs once (see «Every write runs once» above): the confirm waits for the answer through
  `answerOrLetGo`, locked, 7 s at most — on time it closes with the success toast, or stays with the error
  toast and nothing removed; past 7 s it lets go with «Συνεχίζει…», the record stays pending (disabled
  everywhere), and the toast comes with the answer.
- «Ήρθε» undone (`useUndoArrival(arrival, close)`): waits for every delete (same 7 s rule), then takes the
  word back; a failure leaves the time «ήρθε» and says so.
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
  deletes them, goal LAST (`firestore.ts:397`), one log write. Loans someone paid that are
  owed no more go in the same write (`erase`, see «Goal paid by a friend» below).
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
  debt form. Ids fixed up front (`useCoveredFunding`); the contribution, the expense AND the
  debt are put in their lists on screen at once (the debt too since 2026-11-13), under the
  mutation key `coveredFundingKey`.
- Then a SECOND write: `sync(debtId)` writes the debt's loan record `debt_<debtId>` on the
  main account, which cancels the expense there — no card moves. A failure is healed by
  `useHealDebtCash` on the next Debts visit.
- Edit: `editCoveredDebt` — debt + contribution + expense in one batch, each read first with
  `stillThere` (`firestore.ts:1106`); the plan from `coveredEdit` (`coveredLink.ts:142`).
- Deleting the goal — two answers per LOAN (owner, 2026-11-13; `GoalDeleteModal`, choice tiles,
  nothing pre-picked):
  - «Του τα χρωστάω ακόμα» — debt, expense and loan record stay; the deposit goes with the goal
    (the debt keeps `forGoalId` to a goal that is gone).
  - «Δεν του χρωστάω τίποτα — σβήσ' τα» (cancelled & refunded, or typed by mistake) — as if it
    never happened: the debt, its expense, its deposit and its cash records (`debt_<id>` …)
    deleted IN THE SAME BATCH as the goal (`deleteInvestmentGoal` / `closeInvestmentGoal` with
    `erase: CoveredErase[]`, read by `coveredErasure`, `firestore.ts`). Spendable and every card
    are unchanged by it (the expense and its loan record cancelled on the main account);
    «Χρωστάς» drops by the debt; the month's spending drops by the expense.
  - A loan already partly repaid is not asked: it stays, and the dialog says how much was paid
    back and what is left (erasing it would delete repayments that moved a card — delete them
    on «Χρέη» first if they were a mistake). Settled / let-go loans: a note, nothing asked.
  - Which loans: by their stored links (`goalLoans`, `features/budget/goalLoans.ts`) — the
    `debtId`s the goal's deposits carry + debts with `forGoalId` = the goal — never by what
    the device holds. `useGoalLoans` waits for the debts list and for any covered-funding save
    in flight, then reads from the server by id only the linked debts the list lacks
    (`getDebtsByIds`: 1 read + 1 repayment query each). Asked per loan, so the same person's
    two loans can end differently; the question names the day when a person has two.
  - The erase reads from the server, per loan: the debt (1), its repayments (`userId + debtId`,
    ≥1), its cash records (`transactions` `userId + debtId`, ≥1), its expense (1) — ~4 reads a
    loan. Only documents that are there are named (production refuses a missing delete). A loan
    deleted from «Χρέη» meanwhile is skipped; one with repayments on the server throws
    `CoveredRepaidError` (nothing written; the page re-reads the debts and says so); a debt of
    another goal throws. Each loan's records go whole in one batch (`commitDeleteGroups`,
    ≤ 450), the goal last. One `noteDeletions` for everything (`debts`, `transactions`,
    `investmentContributions`, `investmentGoals`). Cost per erased loan: ~4 reads, 3 deletes.
  - Old «Ακυρώθηκε» debts (`forgiven.refund`) written before 2026-11-13 stay as they are and
    still show «Ακυρώθηκε» on «Χρέη»; nothing writes `refund: true` any more
    (`cancelCoveredDebt` / `useCancelCoveredDebts` removed — the goal delete was their only caller).
- Delete: `deleteCoveredDebt` — repayments + contribution + expense + debt, the two links only
  if `stillThere` (`firestore.ts:1141`).
- Locked: the expense (`covered`; payee locked when the debt does not name it — older debts
  found it by figures, `coveredExpenses` in `coveredLink.ts:46`).
- Tests: `goalLoans.test.ts`, `useGoalLoans.test.tsx`, `components/GoalDeleteModal.test.tsx`
  (several loans), `firebase/firestore.test.ts` («a goal someone paid for, deleted with its
  loans (2+ loans)» — strict deletes, figures by hand), `coveredLink.test.ts`,
  `useCoveredLink.test.tsx`, `coveredDebt.demo.test.ts`, `features/debts/AddDebtModal.goal.test.tsx`.

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

### Banks & cash on the Overview «Περιουσία» (read-only)
- «Από τι αποτελείται» = `positionParts` (`overview/overviewTabs.ts`): «Τράπεζες & μετρητά» = `projectedTotal`
  (the Banks page total, Σ `expectedByAccount`), «Από αυτά, στους στόχους» = −`goalHeldTotal`, then owed to me /
  owed by me; net = banks − goals in banks + owed to me − owed by me = the money card's balance + owed to me −
  owed by me. Investments and goal money handed to someone (`heldBy`) are listed beside the net, not in it.
  Before the first reading: one line, the records' sum. The series' running month counts every record, a
  future-dated one too, as `currentBalance` does (`netWorthSeries`). Tests: `overviewTabs.position.test.ts`.

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
- The count «N to pay» (menu badge, phone menu dot, «Πληρωμές» tab, Overview «Εκκρεμή») is ONE rule,
  `billsNeedingAttention` (late or due within 7 days, `billUrgency`), on the ONE cached bills list, on the ONE
  day `useToday()` — `useBillsNeedingAttention` for the menu, the same call in `BillsPage`. A payment patches
  that list (`editPayments` → `computeBillStatus`), so every count drops at once, no read. (2026-11-16: the page
  counted from when it opened, the menu from when the bills last changed — overnight they disagreed.)
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
- Undo: each record deleted with `useDeleteTransaction` (separate writes, not one batch, all
  awaited) and only then the `planner-occurrences` override cleared (`useUndoArrival`); the
  `ConfirmSheet` stays locked until the answer, a failure keeps the «Ήρθε» and toasts.
- Not locked: deleting the transaction takes the «Ήρθε» back everywhere.
- Tests: `features/incomes/IncomesPage.test.tsx`, `useSalaryIncome.test.tsx`.

### Names: payee rename, category merge
- `renamePayeeEverywhere`, `mergeCategoriesEverywhere` (`src/firebase/names.ts`): update every
  record id held on the device, ≤ 450 per batch, the user doc / dropped categories LAST.
  Bulk/delete → online only. Tests: `firebase/names.test.ts`.

## Demo mode — zero Firebase calls

- Unknown devices start in the demo (`startsInDemo`, `src/demo/demoMode.ts`; never on
  `/login`, `/register`, `/terms`, `/privacy`). Decided once per page load. A deliberate sign-out
  makes the device unknown again (`rememberSignedOut`) until the next sign-in.
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
