import { describe, it, expect, vi } from "vitest";
import { deliverPdf, pdfFromJpegs, wrapText } from "./statementPdf";

// The file phones get. The drawing needs a real canvas (the browser check
// covers it); the file around the pictures, and how it is handed over, are
// checked here.

const text = async (blob: Blob) => new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()));
const fakeJpeg = (n: number) => ({ bytes: new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9]), width: 100, height: 141 });

describe("pdfFromJpegs", () => {
  it("is a PDF with one page per picture, and a cross-reference that points at every object", async () => {
    const blob = pdfFromJpegs([fakeJpeg(1), fakeJpeg(2)]);
    expect(blob.type).toBe("application/pdf");
    const body = await text(blob);
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body).toContain("/Count 2");
    expect(body.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(body.match(/\/Filter \/DCTDecode/g)).toHaveLength(2);

    // Every offset in the table is where its object really starts — checked
    // by finding each "n 0 obj" in the bytes, the other way round.
    const xref = body.slice(body.indexOf("xref"));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(8);
    offsets.forEach((offset, i) => expect(body.slice(offset, offset + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    // And startxref points at the table.
    const startxref = Number(body.match(/startxref\n(\d+)/)![1]);
    expect(body.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("keeps each picture's bytes whole, with the length it declares", async () => {
    const body = await text(pdfFromJpegs([fakeJpeg(7)]));
    expect(body).toContain("/Length 5 >>\nstream\nÿØ\u0007ÿÙ\nendstream");
  });
});

describe("wrapText", () => {
  const measure = (s: string) => s.length; // one unit a letter

  it("breaks between words to fit the width", () => {
    expect(wrapText(measure, "Ηλεκτρικό ρεύμα σπιτιού", 15)).toEqual(["Ηλεκτρικό ρεύμα", "σπιτιού"]);
  });

  it("splits a word longer than the line rather than running past it", () => {
    expect(wrapText(measure, "Υπερμεγαλοκατηγορία", 8)).toEqual(["Υπερμεγα", "λοκατηγο", "ρία"]);
  });

  it("gives one empty line for no words", () => {
    expect(wrapText(measure, "", 10)).toEqual([""]);
  });
});

describe("deliverPdf", () => {
  const blob = new Blob(["%PDF"], { type: "application/pdf" });

  it("uses the share sheet where files can be shared", async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    try {
      expect(await deliverPdf(blob, "s.pdf", "Statement")).toBe("shared");
      expect(share).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(navigator, { canShare: undefined, share: undefined });
    }
  });

  it("asks for a fresh tap when the share sheet refuses one that came too late", async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn(async () => Promise.reject(new DOMException("late", "NotAllowedError"))) });
    try {
      await expect(deliverPdf(blob, "s.pdf", "Statement")).rejects.toMatchObject({ name: "NotAllowedError" });
    } finally {
      Object.assign(navigator, { canShare: undefined, share: undefined });
    }
  });

  it("downloads where there is no share sheet", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(await deliverPdf(blob, "s.pdf", "Statement")).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
