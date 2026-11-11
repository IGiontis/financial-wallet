import { describe, it, expect, vi } from "vitest";

// The library's two calls, replaced by spies before the wrapper is installed,
// so what reaches them is what the wrapper passed on.
const calls: { type: string; options: unknown }[] = [];
vi.mock("react-toastify", () => ({
  cssTransition: () => () => null,
  toast: {
    error: (_: unknown, options: unknown) => calls.push({ type: "error", options }),
    warning: (_: unknown, options: unknown) => calls.push({ type: "warning", options }),
    success: (_: unknown, options: unknown) => calls.push({ type: "success", options }),
  },
}));

const { installToastDefaults, TOAST_CONTAINER, TOAST_MS, TOAST_MS_BY_TYPE } = await import("./toastDefaults");
const { toast } = await import("react-toastify");

describe("toast timings", () => {
  it("keeps a «saved» short, gives the rest time to be read, and pauses while touched", () => {
    expect(TOAST_CONTAINER.autoClose).toBe(TOAST_MS);
    expect(TOAST_MS_BY_TYPE.success).toBeGreaterThanOrEqual(2500);
    expect(TOAST_MS_BY_TYPE.success).toBeLessThanOrEqual(3000);
    expect(TOAST_MS).toBeGreaterThan(TOAST_MS_BY_TYPE.success);
    expect(TOAST_CONTAINER).toMatchObject({ pauseOnHover: true, pauseOnFocusLoss: true, draggable: true, closeOnClick: true });
  });

  it("keeps errors and warnings longer, unless a call says otherwise", () => {
    installToastDefaults();
    installToastDefaults(); // twice is once
    toast.error("x");
    toast.warning("y");
    toast.error("z", { autoClose: 2000 });
    toast.success("w");
    expect(calls).toEqual([
      { type: "error", options: { autoClose: TOAST_MS_BY_TYPE.error } },
      { type: "warning", options: { autoClose: TOAST_MS_BY_TYPE.warning } },
      { type: "error", options: { autoClose: 2000 } },
      { type: "success", options: { autoClose: TOAST_MS_BY_TYPE.success } },
    ]);
    expect(TOAST_MS_BY_TYPE.error).toBeGreaterThan(TOAST_MS);
  });
});
