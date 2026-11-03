import { scopeTypes, type CategoryScope } from "../../shared/utils/categoryNames";

// ─── Changing what a category is used for ────────────────────────────────────
//
// A category's records were written as income or as expense under it. Turning
// an income category into an expense-only one (or the other way round) would
// leave every one of those records filed under a category that says the
// opposite of what they are. Widening is different: an income-only category
// that becomes «both» keeps every record meaning what it meant, and only gains
// a second half for the other side.
//
// «Both» is two documents with the same name, one per type (see
// `groupCategories`), so widening is creating the missing half — the existing
// document, and every record pointing at it, is left exactly as it was.

/** Scopes a category already in `current` may be changed to. */
export function allowedScopes(current: CategoryScope): CategoryScope[] {
  return current === "both" ? ["both"] : [current, "both"];
}

export const canChangeScope = (current: CategoryScope, next: CategoryScope): boolean => allowedScopes(current).includes(next);

/**
 * The types a change from `current` to `next` has to create a document for —
 * empty when nothing is widened. Throws for a change that is not allowed, so a
 * caller that skipped the check cannot quietly flip a category's meaning.
 */
export function typesToAdd(current: CategoryScope, next: CategoryScope): ("income" | "expense")[] {
  if (!canChangeScope(current, next)) throw new Error(`A ${current} category cannot become ${next}.`);
  const have = new Set(scopeTypes(current));
  return scopeTypes(next).filter((type): type is "income" | "expense" => !have.has(type));
}
