---
name: new-feature
description: Checklist for adding or reshaping a feature, page, form or field in MyFiWallet — use before writing code for anything new the owner asked for, so nothing the app always needs (mockups, rules, demo data, translations, docs) is forgotten.
---

# New feature — the checklist

Work through it in order. Say in Greek, in plain words, what each step found.

## Before code
1. **Read the map, not the tree**: `docs/PROJECT_MAP.md` (where), `docs/COMPONENTS.md` (what to
   reuse), `docs/DECISIONS.md` (what he already decided), and for data `docs/DATABASE.md` +
   `docs/DATA_FLOW.md`. Open code only to confirm or for the detail you need.
2. **Money?** If it changes how money is stored or counted, ask him first, with the trade-off.
3. **Visible?** Show 2–3 rendered options (skill `mockups`) and wait for his pick. Skip only
   when he described the change exactly.
4. **Cost**: say what it costs in Firestore reads/writes per use. Prefer the user doc
   (`useWorkspaceSetting`) and loaded queries over a new collection.

## Build
5. Reuse the pieces in `docs/COMPONENTS.md`. A new shared piece → add it there in the same change.
6. A page copies the Goals/Debts anatomy (`.claude/rules/ui.md`); a form is a wizard with a review.
7. A new collection → skill `new-collection`.
8. Every Firestore call through `src/firebase/firestoreApi.ts`. Demo: NOT now — keep it working
   (fixtures.test passes) and add a line to «Demo backlog» in `docs/DECISIONS.md`; the demo is
   updated in one batch as the LAST task, after all others (owner, 2026-11-14).
9. Every string in `el` and `en` (add keys, don't reorder).
10. Money: tests that reconcile every figure a second way (`.claude/rules/money-tests.md`);
    use the `money-tester` agent for anything non-trivial.

## Done means
11. Skill `verify` passes, with the side-by-side screenshots.
12. Docs updated in the same change: `PROJECT_MAP` (new route/folder), `COMPONENTS` (new shared
    piece), `DATABASE`/`DATA_FLOW` (new field, collection, link), `DECISIONS` (anything he decided).
13. Hand him what only he can do: Console rules block, index, anything to click. Don't commit.
