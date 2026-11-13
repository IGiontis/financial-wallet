import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// «An action waits for its answer» (.claude/rules/ui.md, MUST) — the parts a
// test can see in the source. The owner's report that started it (2026-11-12):
// «delete goal» pressed again while it ran → a second batch → an error toast
// for a goal that was gone.

const SRC = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const sources = files(SRC).map((path) => ({ path: relative(SRC, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }));

describe("every write runs once", () => {
  it("every mutation is declared through `useOnceMutation` — never TanStack's `useMutation` directly", () => {
    const direct = sources
      .filter(({ path }) => path !== "shared/hooks/useOnceMutation.ts")
      .filter(({ text }) => /\buseMutation\b/.test(text) && /from "@tanstack\/react-query"/.test(text) && /import\s*\{[^}]*\buseMutation\b[^}]*\}\s*from "@tanstack\/react-query"/.test(text))
      .map(({ path }) => path);
    expect(direct).toEqual([]);
  });

  it("the guard is in use: every feature hook file that writes declares its mutations with it", () => {
    // A tripwire against the convention quietly dying: these are the files that
    // hold the app's mutations today.
    const users = sources.filter(({ text }) => /\buseOnceMutation\(|\buseOnceMutation</.test(text)).map(({ path }) => path);
    expect(users.length).toBeGreaterThanOrEqual(9);
  });

  it("a dialog that says «Διαγραφή…» while it runs cannot be closed with Esc meanwhile", () => {
    const open = sources.filter(({ text }) => /t\("common\.deleting"\)/.test(text) && !/keyboard=\{!/.test(text)).map(({ path }) => path);
    expect(open).toEqual([]);
  });

  // «The screen never hangs» (the owner, 2026-11-13): a Save sat locked 15 s
  // on his iPhone, with no toast, over a record that had been saved — the
  // handler awaited `mutateAsync`, and a Firestore write settles only when the
  // SERVER answers. New records and edits go through `saveWithoutWaiting`;
  // only online-only actions wait, and those 7 s at most (`answerOrLetGo`).
  const screens = sources.filter(({ path }) => !["shared/hooks/useOnceMutation.ts", "shared/utils/saveWithoutWaiting.ts", "shared/utils/pendingRecords.ts"].includes(path));
  /** Every `x.mutateAsync(` called in the screens (comments that only mention it left out): the mutation's name, and the code before it. */
  const calls = screens.flatMap(({ path, text }) =>
    [...text.matchAll(/([\w.]+)\.mutateAsync\(/g)].flatMap((m) => {
      const before = text.slice(0, m.index);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      if (/^\s*(\/\/|\*)/.test(line) || line.includes("`")) return [];
      return [{ path, name: m[1], before }];
    }),
  );
  /** The call is the work handed to `answerOrLetGo(() => …)`: the last `answerOrLetGo(` before it is close by, and no statement ended in between. */
  const insideAnswerOrLetGo = (before: string) => {
    const at = before.lastIndexOf("answerOrLetGo(");
    if (at < 0) return false;
    const between = before.slice(at);
    return between.length < 400 && !between.includes(";");
  };

  it("no screen awaits a mutation: `await x.mutateAsync(…)` and `x.mutateAsync(…).then(…)` hold a dialog on the server's answer", () => {
    const awaited = screens.filter(({ text }) => /await\s+[\w.]+\.mutateAsync\(|\.mutateAsync\([^;]*?\)\s*\.then\(/.test(text)).map(({ path }) => path);
    expect(awaited).toEqual([]);
  });

  it("every `mutateAsync` left is an online-only action (delete, remove, merge, rename everywhere, closing a goal) run through `answerOrLetGo` — never a create or an edit", () => {
    expect(calls.length).toBeGreaterThan(5);
    const wrong = calls.filter(({ name, before }) => !/(delete|remove|merge|rename|close)/i.test(name) || !insideAnswerOrLetGo(before)).map(({ path, name }) => `${path}: ${name}`);
    expect(wrong).toEqual([]);
  });

  it("no save reports back through `mutate(…, { onSuccess / onError })`: those callbacks die with the dialog — `saveWithoutWaiting` hangs the answer off the write itself", () => {
    const lost = screens.filter(({ text }) => /\w+\.mutate\([^;]*\{\s*on(Success|Error|Settled)/.test(text)).map(({ path }) => path);
    expect(lost).toEqual([]);
  });

  it("no delete reports back through `mutate(…, { onSuccess })`: those callbacks are dropped when the dialog closes or a second call is made, and the answer is lost", () => {
    // `answerOrLetGo` (online-only) or `saveWithoutWaiting` is the way: the toast is said whatever the screen does meanwhile.
    const lost = sources.filter(({ text }) => /\b(delete|remove)\w*\.mutate\([^)]*\{\s*onSuccess/.test(text)).map(({ path }) => path);
    expect(lost).toEqual([]);
  });
});
