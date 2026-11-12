---
name: new-collection
description: Steps for adding a new Firestore collection (or a new kind of document) to MyFiWallet — rules block for the owner, index, sync, account deletion, demo, docs. Use whenever code is about to write to a collection name that does not exist yet.
---

# New Firestore collection

First ask: does it need one? Small per-user definitions (settings, lists of names, a few
dozen items) go on the user doc via `useWorkspaceSetting` — zero extra reads, no rules work.
A collection is for records that grow (one document per event/entry).

If it does:

1. **Type** in `src/shared/types/IndexTypes.ts`; every document carries `userId`,
   `createdAt`, `updatedAt` (delta sync needs `updatedAt` on every write).
2. **Data file** `src/firebase/<name>.ts`, every call through `src/firebase/firestoreApi.ts`.
   Reads through `syncedList(name, userId)`; deletes call `noteDeleted`. Batches name only
   documents known to exist (`stillThere`) — production rules fail the whole batch otherwise.
3. **Account deletion**: add the name to `src/firebase/ownedCollections.ts`.
4. **Demo**: in-memory data in `src/demo/fixtures.ts`; `fixtures.test.ts` must still pass.
5. **Rules block for the owner** — he pastes it in the Firebase console; the collection is
   dead until he does. Same style as the live rules (`docs/DATABASE.md`):

   ```
   match /<name>/{id} {
     allow read, delete: if request.auth != null && resource.data.userId == request.auth.uid;
     allow create: if request.auth != null && request.resource.data.userId == request.auth.uid
                   && validDoc(request.resource.data);
     allow update: if request.auth != null && resource.data.userId == request.auth.uid
                   && request.resource.data.userId == request.auth.uid
                   && validDoc(request.resource.data);
   }
   ```
   Add field checks the collection needs (numbers in range, list sizes).
6. **Index** for him to create: `<name>`: `userId` ASC + `updatedAt` ASC (delta sync), plus any
   query's own. Without it the sync silently falls back to whole reads.
7. **Docs**: a `### <name>` section in `docs/DATABASE.md` (the docs test checks it), links in
   `docs/DATA_FLOW.md` if money moves with another record.
8. Tell him plainly: the block to paste, the index to create, and that it won't work in
   production until both are done.
