import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

describe("toast place", () => {
  // The owner, 2026-11-11: bottom-right went unseen on his laptop. Top-right,
  // under the top bar and clear of it; a phone keeps the top, centred.
  const theme = readFileSync(join(__dirname, "..", "styles", "theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("sits top-right on a wider screen, newest first", () => {
    // jsdom has no phone-sized screen: this is the laptop's container.
    expect(TOAST_CONTAINER).toMatchObject({ position: "top-right", newestOnTop: true, draggableDirection: "x" });
  });

  it("is placed under the top bar, a gutter clear of it", () => {
    expect(theme).toMatch(/--toastify-toast-top-wide:\s*calc\(var\(--topbar-height\)\s*\+\s*var\(--space-\d\)/);
    expect(theme).toMatch(/\.Toastify \.Toastify__toast-container--top-right\s*\{[^}]*top:\s*var\(--toastify-toast-top-wide\)/);
    // And on a phone: the top, centred.
    expect(theme).toMatch(/@media \(max-width: 575\.98px\), \(max-height: 500px\)\s*\{\s*\.Toastify \.Toastify__toast-container,\s*\.Toastify \.Toastify__toast-container--top-center\s*\{[^}]*left:\s*50%/);
  });
});
