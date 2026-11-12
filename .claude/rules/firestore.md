---
paths:
  - "src/firebase/**"
  - "src/demo/**"
  - "src/lib/**"
  - "src/shared/types/**"
  - "src/shared/hooks/**"
  - "src/features/**/hooks/**"
  - "src/features/**/use*.ts"
---

# Data rules — Firestore, sync, demo

The map: `docs/DATABASE.md` (collections, fields, rules, indexes) and `docs/DATA_FLOW.md`
(read / save / delete paths, linked money). Keep both updated in the same change.

- **Free plan.** 50K reads / 20K writes a day for the whole project, no Cloud Functions. Say
  what a feature costs in reads and writes. Reuse loaded queries; per-user settings and small
  definitions go on the user doc (`useWorkspaceSetting`, zero extra reads); never poll.
- Collections are flat, one per kind; every document carries `userId`.
- **Rules live in the Firebase console**, not in the repo. A NEW collection is dead until the
  owner adds its `match` block — hand him the exact block, in the live rules' style
  (`docs/DATABASE.md`), plus any composite index, while building it.
- **Production rules refuse update/delete of a document that does not exist, and that fails
  the WHOLE batch.** In a batch, only name documents known to exist (`stillThere`). The local
  emulator runs without rules and hides this.
- Lists are cached on the device and synced by delta (`updatedAt` on every write); every
  delete calls `noteDeleted`. New lists use the same path (`syncedList`).
- Money that moves between records (transfer, goal paid by a friend, debt and its cash,
  business closing → personal transaction) is written in ONE batch, and the linked records are
  edited and deleted together.
- Account deletion removes every collection the app writes (`ownedCollections.ts`).
- **Every Firestore call goes through the facade** (`src/firebase/firestoreApi.ts`) so the
  public demo makes zero Firebase calls. Every new feature or field needs demo data in
  `src/demo/fixtures.ts`; `fixtures.test.ts` keeps the figures consistent.
- **Never change production data** without the owner's explicit OK for that change.
