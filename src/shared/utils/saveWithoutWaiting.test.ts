import { describe, it, expect, vi } from "vitest";
import type { UseMutationResult } from "@tanstack/react-query";
import { saveWithoutWaiting } from "./saveWithoutWaiting";

/** Stands in for a mutation that has been started but not answered. */
const pendingMutation = () => {
  const calls: { vars: unknown; options?: { onError?: (e: Error) => void } }[] = [];
  const mutation = {
    mutate: (vars: unknown, options?: { onError?: (e: Error) => void }) => calls.push({ vars, options }),
  } as unknown as UseMutationResult<unknown, Error, unknown, unknown>;
  return { mutation, calls };
};

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

  it("passes the variables through untouched", () => {
    const { mutation, calls } = pendingMutation();
    const vars = { transactionId: "t1", data: { amount: 5 } };

    void saveWithoutWaiting(mutation, vars);

    expect(calls[0].vars).toBe(vars);
  });

  it("hands a later failure to the caller rather than swallowing it", () => {
    // Nothing is awaiting the promise any more, so this is the only route a
    // rejected write has back to the reader.
    const { mutation, calls } = pendingMutation();
    const onFailure = vi.fn();
    const boom = new Error("permission-denied");

    void saveWithoutWaiting(mutation, {}, onFailure);
    calls[0].options?.onError?.(boom);

    expect(onFailure).toHaveBeenCalledWith(boom);
  });

  it("never rejects, so a caller's catch cannot reopen a closed dialog", async () => {
    const { mutation, calls } = pendingMutation();

    const promise = saveWithoutWaiting(mutation, {}, () => {});
    calls[0].options?.onError?.(new Error("offline"));

    await expect(promise).resolves.toBeUndefined();
  });
});
