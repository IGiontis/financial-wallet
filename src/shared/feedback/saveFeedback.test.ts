import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { celebrateSave, grewBy, useSavedFlash } from "./saveFeedback";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
  document.body.innerHTML = '<div class="modal show"><div class="modal-content"></div></div>';
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("celebrateSave", () => {
  it("pulses the open dialog, then takes the pulse off again", () => {
    celebrateSave();
    const card = document.querySelector(".modal-content")!;
    expect(card.classList.contains("save-pulse")).toBe(true);
    vi.advanceTimersByTime(800);
    expect(card.classList.contains("save-pulse")).toBe(false);
  });

  it("throws confetti for a milestone only, and clears it away", () => {
    celebrateSave({ collection: "x" });
    expect(document.querySelector(".mfw-confetti")).toBeNull();
    celebrateSave({ milestone: true });
    expect(document.querySelectorAll(".mfw-confetti__piece").length).toBeGreaterThan(0);
    vi.advanceTimersByTime(2000);
    expect(document.querySelector(".mfw-confetti")).toBeNull();
  });
});

describe("useSavedFlash", () => {
  it("lights the row the save named, in its own list only", () => {
    const { result } = renderHook(() => useSavedFlash("debts", ["a", "b"]));
    act(() => celebrateSave({ collection: "transactions", id: "b" }));
    expect(result.current("b")).toBe("");
    act(() => celebrateSave({ collection: "debts", id: "b" }));
    expect(result.current("b")).toBe("row-flash");
    expect(result.current("a")).toBe("");
  });

  it("lights the new row when the save did not know its id — arriving after the word", () => {
    const { result, rerender } = renderHook(({ ids }) => useSavedFlash("transactions", ids), { initialProps: { ids: ["a"] } });
    act(() => celebrateSave({ collection: "transactions" }));
    rerender({ ids: ["n", "a"] });
    expect(result.current("n")).toBe("row-flash");
  });

  it("…or drawn a moment before it (an optimistic save)", () => {
    const { result, rerender } = renderHook(({ ids }) => useSavedFlash("transactions", ids), { initialProps: { ids: ["a"] } });
    rerender({ ids: ["n", "a"] });
    act(() => celebrateSave({ collection: "transactions" }));
    expect(result.current("n")).toBe("row-flash");
    expect(result.current("a")).toBe("");
  });

  it("does not light a row a filter or the next page brings in, after a save landed out of sight", () => {
    const page1 = ["a", "b", "c", "d"];
    const page2 = ["e", "f", "g", "h"];
    const { result, rerender } = renderHook(({ ids }) => useSavedFlash("transactions", ids), { initialProps: { ids: page1 } });
    act(() => celebrateSave({ collection: "transactions" })); // its row is on another page
    rerender({ ids: page2 }); // the reader turns the page
    for (const id of page2) expect(result.current(id)).toBe("");
    rerender({ ids: ["x", ...page2] }); // …and later a row really is added
    expect(result.current("x")).toBe(""); // nobody announced it
  });

  it("forgets a row that arrived long before the save said so", () => {
    const { result, rerender } = renderHook(({ ids }) => useSavedFlash("transactions", ids), { initialProps: { ids: ["a", "b"] } });
    rerender({ ids: ["n", "a", "b"] });
    vi.advanceTimersByTime(2000);
    act(() => celebrateSave({ collection: "transactions" }));
    expect(result.current("n")).toBe("");
  });

  it("stops waiting after five seconds", () => {
    const { result, rerender } = renderHook(({ ids }) => useSavedFlash("transactions", ids), { initialProps: { ids: ["a", "b"] } });
    act(() => celebrateSave({ collection: "transactions" }));
    vi.advanceTimersByTime(6000);
    rerender({ ids: ["n", "a", "b"] });
    expect(result.current("n")).toBe("");
  });
});

describe("grewBy", () => {
  const before = new Set(["a", "b", "c", "d"]);
  it("names the one new row when the list grew", () => expect(grewBy(before, ["n", "a", "b", "c", "d"])).toBe("n"));
  it("says nothing came in when nothing did", () => expect(grewBy(before, ["a", "b"])).toBeNull());
  it("calls a filter or another page a different list", () => {
    expect(grewBy(before, ["e", "f", "g", "h"])).toBeUndefined();
    expect(grewBy(before, ["a", "e", "f"])).toBeUndefined(); // under half kept
    expect(grewBy(before, ["a", "b", "c", "d", "e", "f", "g", "h"])).toBeUndefined(); // > 3 new
  });
});
