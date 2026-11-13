import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UseMutationResult } from "@tanstack/react-query";
import { saveWithoutWaiting } from "./saveWithoutWaiting";
import { pendingKindOf, resetPendingRecords } from "./pendingRecords";

/** Stands in for a mutation that has been started and answers only when told to. */
const pendingMutation = () => {
  const calls: { vars: unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
  const mutation = {
    mutateAsync: (vars: unknown) => new Promise((resolve, reject) => calls.push({ vars, resolve, reject })),
  } as unknown as UseMutationResult<unknown, Error, unknown, unknown>;
  return { mutation, calls };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => resetPendingRecords());

describe("saveWithoutWaiting", () => {
  it("resolves while the write is still in flight", async () => {
    // The whole point. Firestore settles a write promise only on server
    // acknowledgement, so awaiting one offline waits for ever — which is how a
    // dialog on "Saving…" became "the app is frozen".
    const { mutation, calls } = pendingMutation();
    const settled = vi.fn();

    await saveWithoutWaiting(mutation, { amount: 12 }).then(settled);

    expect(settled).toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0].vars).toEqual({ amount: 12 });
  });

  it("passes the variables through, with only the user's text cleaned", () => {
    const { mutation, calls } = pendingMutation();
    const date = new Date(2026, 0, 1);
    const vars = { transactionId: "t1", data: { amount: 5, date, categoryId: "c 1", description: "  Σκι   διακοπές  " } };

    void saveWithoutWaiting(mutation, vars);

    expect(calls[0].vars).toEqual({ transactionId: "t1", data: { amount: 5, date, categoryId: "c 1", description: "Σκι διακοπές" } });
    expect((calls[0].vars as typeof vars).data.date).toBe(date);
  });

  it("hands a later failure to the caller rather than swallowing it — from the write's own promise, so it is said after the dialog has gone", async () => {
    const { mutation, calls } = pendingMutation();
    const onFailure = vi.fn();
    const boom = new Error("permission-denied");

    void saveWithoutWaiting(mutation, {}, onFailure);
    calls[0].reject(boom);
    await flush();

    expect(onFailure).toHaveBeenCalledWith(boom);
  });

  it("never rejects, so a caller's catch cannot reopen a closed dialog", async () => {
    const { mutation, calls } = pendingMutation();

    const promise = saveWithoutWaiting(mutation, {}, () => {});
    calls[0].reject(new Error("offline"));

    await expect(promise).resolves.toBeUndefined();
  });

  it("marks the records as a save in flight until the server has them — and clears the mark on a refusal too", async () => {
    const { mutation, calls } = pendingMutation();

    void saveWithoutWaiting(mutation, {}, undefined, [["goals", "g1"]]);
    void saveWithoutWaiting(mutation, {}, () => {}, [["goals", "g2"]]);
    expect(pendingKindOf("goals", "g1")).toBe("save");
    expect(pendingKindOf("goals", "g2")).toBe("save");

    calls[0].resolve("ok");
    calls[1].reject(new Error("permission-denied"));
    await flush();

    expect(pendingKindOf("goals", "g1")).toBeUndefined();
    expect(pendingKindOf("goals", "g2")).toBeUndefined();
  });
});
