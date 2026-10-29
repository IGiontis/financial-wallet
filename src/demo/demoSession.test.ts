import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { i18n as I18n } from "i18next";
import { demoLanguage, seedDemo, startDemo } from "./demoSession";
import { doc, memoryCollection, setDoc, updateDoc } from "./memoryFirestore";
import { onDemoReseed } from "./demoMode";
import { DEMO_UID } from "./demoUser";
import { DEMO_IDS } from "./fixtures";

// The demo starts in the language on screen, and is made again when it
// changes — the bills, shops and goals are words — with every query reset to
// read the new copy. Unless the visitor has already written to it: then their
// account stays, and only the language it says it is in follows.

function fakeI18n(language: string) {
  const listeners = new Set<(lng: string) => void>();
  return {
    resolvedLanguage: language,
    language,
    on: (_event: string, fn: (lng: string) => void) => listeners.add(fn),
    off: (_event: string, fn: (lng: string) => void) => listeners.delete(fn),
    change: (lng: string) => listeners.forEach((fn) => fn(lng)),
    listeners,
  };
}

const billName = () => memoryCollection("bills")[DEMO_IDS.bills.electricity]?.name;

describe("startDemo", () => {
  it("reads the language as the app has it, Greek or else English", () => {
    expect(demoLanguage("el")).toBe("el");
    expect(demoLanguage("el-GR")).toBe("el");
    expect(demoLanguage("en-US")).toBe("en");
    expect(demoLanguage(undefined)).toBe("en");
  });

  it("seeds in the language on screen, and again in the new one when it changes", () => {
    const i18n = fakeI18n("el");
    const client = new QueryClient();
    const reset = vi.spyOn(client, "resetQueries").mockResolvedValue();
    const stop = startDemo(i18n as unknown as I18n, client);

    expect(billName()).toBe("ΔΕΗ");
    expect(memoryCollection("users")[DEMO_UID].locale).toBe("el");

    // The same language again is no change: the visitor's edits stay.
    i18n.change("el-GR");
    expect(reset).not.toHaveBeenCalled();

    i18n.change("en");
    expect(billName()).toBe("Electricity");
    expect(memoryCollection("users")[DEMO_UID].locale).toBe("en");
    expect(reset).toHaveBeenCalledTimes(1);

    stop();
    expect(i18n.listeners.size).toBe(0);
  });

  it("keeps an account the visitor has written to, with the currency saved beside the language", async () => {
    const i18n = fakeI18n("el");
    const client = new QueryClient();
    const reset = vi.spyOn(client, "resetQueries").mockResolvedValue();
    const stop = startDemo(i18n as unknown as I18n, client);

    // What Settings does: the currency and the language in one save, then the switch.
    await updateDoc(doc(null, "users", DEMO_UID), { currency: "GBP", locale: "en" });
    await setDoc(doc(null, "transactions", "visitor-coffee"), { userId: DEMO_UID, amount: 3.5 });
    i18n.change("en");

    expect(reset).not.toHaveBeenCalled();
    expect(memoryCollection("transactions")).toHaveProperty("visitor-coffee");
    expect(memoryCollection("users")[DEMO_UID]).toMatchObject({ currency: "GBP", locale: "en" });
    expect(billName()).toBe("ΔΕΗ");

    // A language switch alone, on the kept account: the language it says follows.
    i18n.change("el");
    expect(memoryCollection("users")[DEMO_UID].locale).toBe("el");
    expect(reset).not.toHaveBeenCalled();
    stop();
  });

  it("carries the display currency into a fresh copy, and tells every copy-keeper", () => {
    seedDemo("el");
    memoryCollection("users");
    const heard = vi.fn();
    const off = onDemoReseed(heard);
    // Written by hand, as a reseed with nothing touched would find it.
    return updateDoc(doc(null, "users", DEMO_UID), { currency: "USD" }).then(() => {
      seedDemo("en");
      expect(memoryCollection("users")[DEMO_UID]).toMatchObject({ currency: "USD", locale: "en" });
      expect(heard).toHaveBeenCalledTimes(1);
      off();
    });
  });
});
