import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import i18n from "../../i18n";
import type { CreateTransactionDTO, Transaction } from "../types/IndexTypes";
import { answerOrLetGo, LET_GO_MS, pendingKindOf, resetPendingRecords } from "./pendingRecords";
import { saveWithoutWaiting } from "./saveWithoutWaiting";
import { usePendingRecords } from "../hooks/usePendingRecords";
import { useOnceMutation } from "../hooks/useOnceMutation";
import { DeleteButton } from "../components/DeleteButton";
import { transactionKeys, useCreateTransaction } from "../../features/transactions/hooks/useTransactions";

// «The screen never hangs» (the owner, 2026-11-13): on his iPhone a Save sat
// locked 15 s with no toast, over a record that had been saved — a Firestore
// write settles only when the SERVER answers. A new record never waits for
// that; an online-only action waits 7 s at most, then lets go and answers
// later. These run the real hook, the real cache edit and the real helpers,
// with only Firestore (and the clock) in our hands.

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock("react-toastify", async (original) => ({ ...(await original<typeof import("react-toastify")>()), toast: toasts }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));

/** The server: each write waits until the test answers it. */
const server = vi.hoisted(() => ({ writes: [] as { id: string; resolve: () => void; reject: (e: unknown) => void }[] }));
vi.mock("../../firebase/firestore", () => ({
  newDocId: (() => {
    let n = 0;
    return () => `new-${++n}`;
  })(),
  getTransactions: vi.fn(async () => {
    throw new Error("no read expected");
  }),
  createTransaction: (_userId: string, _data: unknown, id: string) =>
    new Promise<string>((resolve, reject) => {
      server.writes.push({ id, resolve: () => resolve(id), reject });
    }),
}));

const day = new Date(2026, 10, 13);
const bread = { id: "t-bread", userId: "u1", amount: 3, type: "expense", categoryId: "food", date: day, description: "Bread", createdAt: day, updatedAt: day } as Transaction;

/** The list, as every page reads it: the cached transactions, never re-read here. */
function List() {
  // What the server holds — read only when a refused write has the list put back (`restoreList`).
  const { data = [] } = useQuery<Transaction[]>({ queryKey: transactionKeys.all("u1"), queryFn: async () => [bread], staleTime: Infinity });
  return (
    <ul aria-label="list">
      {data.map((row) => (
        <li key={row.id}>{row.description}</li>
      ))}
    </ul>
  );
}

/** A form that saves the way every new-record form does (`AddTransactionModal` + `NewTransactionPage`). */
function NewRecord() {
  const create = useCreateTransaction();
  const [open, setOpen] = useState(true);
  const save = async () => {
    const dto: CreateTransactionDTO = { amount: 4.5, type: "expense", categoryId: "food", date: day, description: "Coffee" };
    await saveWithoutWaiting(create, dto, () => toasts.error("transactions.saveFailed"));
    toasts.success("transactions.addedSuccess");
    setOpen(false);
  };
  return open ? (
    <div role="dialog">
      <button type="button" onClick={() => void save()}>
        Save
      </button>
    </div>
  ) : null;
}

const client = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(transactionKeys.all("u1"), [bread]);
  return queryClient;
};
const listed = () => [...screen.getByRole("list", { name: "list" }).querySelectorAll("li")].map((li) => li.textContent);

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  server.writes = [];
  resetPendingRecords();
  for (const fn of Object.values(toasts)) fn.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets promises and the query cache's scheduled notifications run. */
const settle = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("a new record never waits for the server", () => {
  it("whose acknowledgement never comes: the dialog has closed, the toast is up and the row is on the list — at once, and a minute later still", async () => {
    render(
      <QueryClientProvider client={client()}>
        <List />
        <NewRecord />
      </QueryClientProvider>,
    );
    await settle();
    expect(listed()).toEqual(["Bread"]);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await settle();

    // The write left and has not been answered.
    expect(server.writes).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toasts.success).toHaveBeenCalledTimes(1);
    expect(listed()).toEqual(expect.arrayContaining(["Bread", "Coffee"]));
    expect(listed()).toHaveLength(2);

    await settle(60_000);
    expect(toasts.error).not.toHaveBeenCalled();
    expect(listed()).toHaveLength(2);
  });

  it("refused later: the error toast is said after the dialog has gone, and the row leaves the list", async () => {
    render(
      <QueryClientProvider client={client()}>
        <List />
        <NewRecord />
      </QueryClientProvider>,
    );
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(listed()).toHaveLength(2);
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => server.writes[0].reject(new Error("permission-denied")));
    await settle();

    expect(toasts.error).toHaveBeenCalledTimes(1);
    expect(toasts.error).toHaveBeenCalledWith("transactions.saveFailed");
    expect(listed()).toEqual(["Bread"]);
    // Only one success, said when it was on screen — none for the refusal.
    expect(toasts.success).toHaveBeenCalledTimes(1);
  });
});

/** A write that answers only when told to. */
function gate() {
  const calls: { vars: string; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const fn = vi.fn(
    (vars: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ vars, resolve, reject });
      }),
  );
  return { fn, calls };
}

/** A row with its delete, wired as the pages are: `DeleteButton` → `answerOrLetGo`, the row wearing `.row-pending`. */
function Row({ write }: { write: ReturnType<typeof gate> }) {
  const remove = useOnceMutation({ onceBy: (id: string) => id, mutationFn: write.fn });
  const { busy, pendingClass } = usePendingRecords();
  const [gone, setGone] = useState(false);
  const [sheet, setSheet] = useState(true);
  if (gone) return null;
  return (
    <div data-testid="row" className={pendingClass("bills", "b1")} aria-busy={busy("bills", "b1") || undefined}>
      Water
      {sheet && (
        <DeleteButton
          what="Water"
          onClick={() =>
            answerOrLetGo(() => remove.mutateAsync("b1"), {
              records: [["bills", "b1"]],
              close: () => setSheet(false),
              succeeded: () => {
                toasts.success("toasts.billDeleted");
                setGone(true);
              },
              failed: () => toasts.error("toasts.billDeleteFailed"),
            })
          }
        />
      )}
    </div>
  );
}

const renderRow = (write: ReturnType<typeof gate>) =>
  render(
    <QueryClientProvider client={client()}>
      <Row write={write} />
    </QueryClientProvider>,
  );

/** Asks, then confirms in the question that comes up. */
const confirmDelete = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await settle();
  const dialog = screen.getByRole("dialog");
  const red = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Delete")!;
  fireEvent.click(red);
  await settle();
};

describe("an online-only action waits 7 s at most", () => {
  it("answered in time: locked while it runs, then the toast and the question goes", async () => {
    const write = gate();
    renderRow(write);
    await confirmDelete();

    expect(screen.getByText(i18n.t("common.deleting"))).toBeTruthy();
    expect(screen.getByTestId("row").className).toContain("row-pending");

    await act(async () => write.calls[0].resolve());
    await settle(400);

    expect(toasts.success).toHaveBeenCalledWith("toasts.billDeleted");
    expect(toasts.info).not.toHaveBeenCalled();
    expect(screen.queryByTestId("row")).toBeNull();
    expect(pendingKindOf("bills", "b1")).toBeUndefined();
  });

  it("longer than 7 s: the dialog lets go at 7 s with the info toast, the row stays disabled, and the real answer comes as a toast when it lands", async () => {
    const write = gate();
    renderRow(write);
    await confirmDelete();

    await settle(LET_GO_MS - 1);
    expect(screen.getByText(i18n.t("common.deleting"))).toBeTruthy();
    expect(toasts.info).not.toHaveBeenCalled();

    await settle(1);
    await settle(400);
    expect(toasts.info).toHaveBeenCalledTimes(1);
    expect(toasts.info).toHaveBeenCalledWith(i18n.t("toasts.stillRunning"));
    expect(i18n.t("toasts.stillRunning")).not.toBe("toasts.stillRunning");
    // The question and its sheet have let go; the row has not.
    expect(screen.queryByText(i18n.t("common.deleting"))).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByTestId("row").className).toContain("row-pending");
    expect(screen.getByTestId("row").getAttribute("aria-busy")).toBe("true");
    expect(toasts.success).not.toHaveBeenCalled();

    await act(async () => write.calls[0].resolve());
    await settle();

    expect(toasts.success).toHaveBeenCalledTimes(1);
    expect(toasts.error).not.toHaveBeenCalled();
    expect(pendingKindOf("bills", "b1")).toBeUndefined();
    expect(screen.queryByTestId("row")).toBeNull();
  });

  it("refused after it let go: the error toast, and the row comes back to life", async () => {
    const write = gate();
    renderRow(write);
    await confirmDelete();
    await settle(LET_GO_MS);

    await act(async () => write.calls[0].reject(new Error("permission-denied")));
    await settle();

    expect(toasts.error).toHaveBeenCalledWith("toasts.billDeleteFailed");
    expect(toasts.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("row").className).not.toContain("row-pending");
  });

  it("runs once: presses while it runs start nothing, before and after the dialog lets go", async () => {
    const write = gate();
    renderRow(write);
    await confirmDelete();

    // The red button again while it runs: locked.
    const red = [...screen.getByRole("dialog").querySelectorAll("button")].find((b) => b.textContent === i18n.t("common.deleting"))!;
    expect(red.hasAttribute("disabled")).toBe(true);
    fireEvent.click(red);
    await settle(LET_GO_MS);

    // After it let go, the same delete asked again (another screen, the same record) hears the first one's answer.
    const again = answerOrLetGo(() => write.fn.mock.results[0].value as Promise<void>, { records: [["bills", "b1"]] });
    await act(async () => write.calls[0].resolve());
    await settle();
    await expect(again).resolves.toBe("done");
    expect(write.fn).toHaveBeenCalledTimes(1);
  });
});

describe("answerOrLetGo", () => {
  it("on time and refused: says so, does not close (the dialog stays as it was), clears the mark", async () => {
    const close = vi.fn();
    const failed = vi.fn();
    let reject!: (e: unknown) => void;
    const outcome = answerOrLetGo(() => new Promise((_, r) => (reject = r)), { records: [["goals", "g1"]], close, failed });
    expect(pendingKindOf("goals", "g1")).toBe("action");
    reject(new Error("nope"));
    await expect(outcome).resolves.toBe("failed");
    expect(failed).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(pendingKindOf("goals", "g1")).toBeUndefined();
  });

  it("a throw before the write leaves is a failure, not a hang", async () => {
    const failed = vi.fn();
    const outcome = answerOrLetGo(
      () => {
        throw new Error("offline");
      },
      { failed },
    );
    await expect(outcome).resolves.toBe("failed");
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("two actions on one record: the mark stays until both have answered", async () => {
    let first!: () => void;
    let second!: () => void;
    void answerOrLetGo(() => new Promise<void>((r) => (first = r)), { records: [["debts", "d1"]] });
    void answerOrLetGo(() => new Promise<void>((r) => (second = r)), { records: [["debts", "d1"]] });
    first();
    await settle();
    expect(pendingKindOf("debts", "d1")).toBe("action");
    second();
    await settle();
    expect(pendingKindOf("debts", "d1")).toBeUndefined();
  });
});
