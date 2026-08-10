import { describe, it, expect } from "vitest";
import { addPayee, filterPayees, isUnsavedPayee, payeeKey, removePayee, renamePayee, sortPayees, validatePayee, MAX_PAYEE_LENGTH } from "./payeeStore";

describe("payeeKey", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(payeeKey("  Shell ")).toBe(payeeKey("shell"));
  });
});

describe("validatePayee", () => {
  it("rejects an empty or whitespace-only name", () => {
    expect(validatePayee([], "")).toBe("empty");
    expect(validatePayee([], "   ")).toBe("empty");
  });

  it("rejects a name that is already saved, whatever the casing", () => {
    expect(validatePayee(["Shell"], " shell ")).toBe("duplicate");
  });

  it("rejects an over-long name", () => {
    expect(validatePayee([], "x".repeat(MAX_PAYEE_LENGTH + 1))).toBe("tooLong");
    expect(validatePayee([], "x".repeat(MAX_PAYEE_LENGTH))).toBeUndefined();
  });

  it("allows a rename that keeps the same name", () => {
    expect(validatePayee(["Shell"], "Shell", "Shell")).toBeUndefined();
  });

  it("allows a rename that only changes casing", () => {
    expect(validatePayee(["shell"], "Shell", "shell")).toBeUndefined();
  });

  it("still blocks a rename onto a different existing payee", () => {
    expect(validatePayee(["Shell", "BP"], "BP", "Shell")).toBe("duplicate");
  });

  it("accepts a genuinely new name", () => {
    expect(validatePayee(["Shell"], "Aegean")).toBeUndefined();
  });
});

describe("addPayee", () => {
  it("appends a trimmed name", () => {
    expect(addPayee([], "  Shell ")).toEqual(["Shell"]);
  });

  it("refuses a duplicate rather than growing the list", () => {
    expect(addPayee(["Shell"], "shell")).toEqual(["Shell"]);
  });

  it("refuses a blank name", () => {
    expect(addPayee(["Shell"], "  ")).toEqual(["Shell"]);
  });
});

describe("renamePayee", () => {
  it("keeps the entry in its original position", () => {
    expect(renamePayee(["A", "Shell", "B"], "Shell", "Aegean")).toEqual(["A", "Aegean", "B"]);
  });

  it("matches the target case-insensitively", () => {
    expect(renamePayee(["Shell"], "shell", "BP")).toEqual(["BP"]);
  });

  it("can change only the casing of a name", () => {
    expect(renamePayee(["shell"], "shell", "Shell")).toEqual(["Shell"]);
  });

  it("leaves the list alone when the new name clashes", () => {
    expect(renamePayee(["Shell", "BP"], "Shell", "bp")).toEqual(["Shell", "BP"]);
  });

  it("leaves the list alone for a blank new name", () => {
    expect(renamePayee(["Shell"], "Shell", "  ")).toEqual(["Shell"]);
  });
});

describe("removePayee", () => {
  it("removes case-insensitively", () => {
    expect(removePayee(["Shell", "BP"], "shell")).toEqual(["BP"]);
  });

  it("is a no-op for something not in the list", () => {
    expect(removePayee(["Shell"], "Nope")).toEqual(["Shell"]);
  });
});

describe("sortPayees", () => {
  it("sorts alphabetically ignoring case, without mutating the input", () => {
    const input = ["shell", "Aegean", "BP"];
    expect(sortPayees(input)).toEqual(["Aegean", "BP", "shell"]);
    expect(input).toEqual(["shell", "Aegean", "BP"]);
  });
});

describe("filterPayees", () => {
  const payees = ["Fresh Market", "Shell", "Shelter Insurance"];

  it("returns everything for an empty query", () => {
    expect(filterPayees(payees, "  ")).toEqual(payees);
  });

  it("ranks a prefix match above a mid-word match", () => {
    const result = filterPayees(payees, "sh");
    expect(result[result.length - 1]).toBe("Fresh Market");
    expect(result).toContain("Shell");
  });

  it("is case-insensitive", () => {
    expect(filterPayees(payees, "SHELL")).toEqual(["Shell"]);
  });

  it("returns nothing when there is no match", () => {
    expect(filterPayees(payees, "zzz")).toEqual([]);
  });
});

describe("isUnsavedPayee", () => {
  it("is false for a saved payee, whatever the casing", () => {
    expect(isUnsavedPayee(["Shell"], " shell ")).toBe(false);
  });

  it("is true for something not on the list", () => {
    expect(isUnsavedPayee(["Shell"], "Aegean")).toBe(true);
  });

  it("is false for an empty query — there is nothing to use", () => {
    expect(isUnsavedPayee(["Shell"], "   ")).toBe(false);
  });
});
