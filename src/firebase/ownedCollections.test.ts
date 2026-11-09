import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { OWNED_COLLECTIONS, USERS_COLLECTION } from "./ownedCollections";

// Deleting an account removes the collections in OWNED_COLLECTIONS and nothing
// else. A collection written anywhere in the app but missing from that list
// would outlive every account deleted — with nobody left to see it. So this
// reads the source for every collection name it uses and fails on any the list
// does not have: add a collection, and this test sends you to the list (and to
// the Console, whose rules a new collection needs before it works at all).

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }));

/** Every way the code names a collection with a literal. */
const NAMED = [
  /\bcollection\(\s*[\w.]+\s*,\s*["'`](\w+)["'`]/g,
  /\bdoc\(\s*db\s*,\s*["'`](\w+)["'`]/g,
  /\bnewDocId\(\s*["'`](\w+)["'`]/g,
  /\bsyncedList(?:<[^>]*>)?\(\s*["'`](\w+)["'`]/g,
  /\bstillThere\(\s*["'`](\w+)["'`]/g,
  /\b(?:noteDeleted|noteRecreated|forgetLocally)\(\s*[\w.]+\s*,\s*["'`](\w+)["'`]/g,
];

/** A collection named by a variable: only where the variable is one of the names above. */
const DYNAMIC = /\b(?:collection|doc)\(\s*db\s*,\s*(?!["'`])[\w.]+/g;
const DYNAMIC_ALLOWED = new Set(["firebase/syncList.ts", "firebase/firestore.ts"]);

describe("the collections an account owns", () => {
  it("lists every collection the app names anywhere", () => {
    const found = new Map<string, string>();
    for (const { path, text } of files) {
      for (const pattern of NAMED) for (const m of text.matchAll(pattern)) if (!found.has(m[1])) found.set(m[1], path);
    }
    // The scan itself works: the collections everyone knows are found.
    expect([...found.keys()]).toEqual(expect.arrayContaining(["transactions", "bills", "debts", USERS_COLLECTION]));

    const known = new Set<string>([...OWNED_COLLECTIONS, USERS_COLLECTION]);
    const missing = [...found].filter(([name]) => !known.has(name)).map(([name, path]) => `${name} (in ${path})`);
    expect(missing).toEqual([]);
  });

  it("names a collection by a variable only in the data layer, which is scanned above", () => {
    const elsewhere = files.filter(({ path, text }) => !DYNAMIC_ALLOWED.has(path) && !path.startsWith("demo/") && text.match(DYNAMIC) !== null).map((f) => f.path);
    expect(elsewhere).toEqual([]);
  });
});
