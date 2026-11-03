// ─── The statement as a PDF file, for phones ─────────────────────────────────
//
// On a computer the statement is printed — the browser's dialogue saves it as
// a PDF with real, selectable text. Phones are where that fails: an installed
// app on iOS ignores `window.print()`, and mobile browsers' print paths are
// slow, hidden or missing. So there the statement is drawn into a file here,
// and handed to the phone's share sheet (Files, Mail, print) or downloaded.
//
// Drawn on a canvas, page by page, and each page put into the PDF as a JPEG.
// Not a PDF library: those draw text in their own fonts, and the standard PDF
// fonts have no Greek — doing it properly means shipping a Greek typeface of a
// few hundred kilobytes to every phone that asks. The canvas writes with the
// fonts already on the device, exactly as the screen does. The cost is text
// that is a picture (not selectable), which for a statement read, sent or
// printed is a fair trade. This module is loaded only when the button is
// pressed.

export type PdfTone = "income" | "expense";

export interface PdfCell {
  text: string;
  tone?: PdfTone;
}

export interface PdfTable {
  title: string;
  /** The first column takes the slack and wraps; the rest are right-aligned figures. */
  columns: string[];
  rows: { cells: PdfCell[]; total?: boolean }[];
}

export interface PdfStatement {
  brand: string;
  heading: string;
  generated: string;
  summary: { label: string; value: PdfCell }[];
  tables: PdfTable[];
  /** In place of the summary and tables, when the period has nothing in it. */
  empty?: string;
  /** «Σελίδα 1 από 2». */
  pageLabel: (page: number, total: number) => string;
}

/** The theme's paper colours, read as for the light mode: a page is paper, whatever the screen is. */
export interface PdfInk {
  paper: string;
  text: string;
  muted: string;
  rule: string;
  hairline: string;
  income: string;
  expense: string;
  font: string;
}

// A4 in points, and the scale it is drawn at: 2.5 px per point is 180 dpi —
// sharp on a phone held close and on paper; a full page of rows is about 150 KB.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const SCALE = 2.5;
const MARGIN = 45; // 16 mm, as the printed page has it
const JPEG_QUALITY = 0.8;

/**
 * The light mode's roles, whatever mode the screen is in: switched for the
 * length of one read and back, in the same task — no frame is painted in
 * between, so nothing on screen flickers.
 */
export function readPaperInk(root: HTMLElement = document.documentElement): PdfInk {
  const before = root.getAttribute("data-bs-theme");
  root.setAttribute("data-bs-theme", "light");
  try {
    const css = getComputedStyle(root);
    const role = (name: string) => css.getPropertyValue(name).trim();
    return {
      paper: role("--surface"),
      text: role("--text"),
      muted: role("--text-2"),
      rule: role("--text"),
      hairline: role("--border-soft"),
      income: role("--income-text"),
      expense: role("--expense-text"),
      font: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
    };
  } finally {
    if (before === null) root.removeAttribute("data-bs-theme");
    else root.setAttribute("data-bs-theme", before);
  }
}

// ─── Laying out ─────────────────────────────────────────────────────────────

interface Page {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function newPage(ink: PdfInk): Page {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PAGE_W * SCALE);
  canvas.height = Math.round(PAGE_H * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas on this device.");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = ink.paper;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}

/** Words onto lines no wider than `width`; a word longer than the line is split where it must be. */
export function wrapText(measure: (s: string) => number, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let rest = word;
    while (measure(rest) > width && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && measure(rest.slice(0, cut)) > width) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Draws the statement onto as many pages as it needs. */
export function drawStatement(doc: PdfStatement, ink: PdfInk): HTMLCanvasElement[] {
  const pages: Page[] = [];
  let page = newPage(ink);
  pages.push(page);
  let y = MARGIN;
  const right = PAGE_W - MARGIN;
  const width = right - MARGIN;
  const bottom = PAGE_H - MARGIN - 18; // room for the page number

  const font = (size: number, weight = 400) => `${weight} ${size}px ${ink.font}`;
  const text = (s: string, x: number, at: number, size: number, opts: { weight?: number; color?: string; align?: CanvasTextAlign } = {}) => {
    page.ctx.font = font(size, opts.weight);
    page.ctx.fillStyle = opts.color ?? ink.text;
    page.ctx.textAlign = opts.align ?? "left";
    page.ctx.fillText(s, x, at);
  };
  const rule = (at: number, color: string, thickness: number) => {
    page.ctx.fillStyle = color;
    page.ctx.fillRect(MARGIN, at, width, thickness);
  };
  const toneColor = (tone?: PdfTone) => (tone === "income" ? ink.income : tone === "expense" ? ink.expense : ink.text);
  const breakIfNeeded = (height: number): boolean => {
    if (y + height <= bottom) return false;
    page = newPage(ink);
    pages.push(page);
    y = MARGIN;
    return true;
  };

  // The head: the brand and the period on the left, when it was made on the right.
  text(doc.brand, MARGIN, y + 16, 18, { weight: 700 });
  text(doc.heading, MARGIN, y + 34, 11, { color: ink.muted });
  text(doc.generated, right, y + 16, 8.5, { color: ink.muted, align: "right" });
  y += 44;
  rule(y, ink.rule, 1.5);
  y += 18;

  if (doc.empty) {
    text(doc.empty, MARGIN, y + 10, 10, { color: ink.muted });
  } else {
    // Three boxes across: income, expenses, net.
    const gap = 10;
    const boxW = (width - gap * (doc.summary.length - 1)) / doc.summary.length;
    doc.summary.forEach((item, i) => {
      const x = MARGIN + i * (boxW + gap);
      page.ctx.strokeStyle = ink.hairline;
      page.ctx.lineWidth = 1;
      page.ctx.beginPath();
      page.ctx.roundRect?.(x + 0.5, y + 0.5, boxW - 1, 46, 6);
      if (!page.ctx.roundRect) page.ctx.rect(x + 0.5, y + 0.5, boxW - 1, 46);
      page.ctx.stroke();
      text(item.label.toUpperCase(), x + 10, y + 16, 7.5, { color: ink.muted, weight: 600 });
      text(item.value.text, x + 10, y + 36, 13, { weight: 700, color: toneColor(item.value.tone) });
    });
    y += 46 + 20;

    for (const table of doc.tables) {
      const size = 9.5;
      const lineH = 13;
      page.ctx.font = font(size, 700);
      // Each figure column as wide as its widest cell (or heading), the first takes the rest.
      const figureWidths = table.columns.slice(1).map((heading, c) => {
        page.ctx.font = font(7.5, 600);
        let w = page.ctx.measureText(heading.toUpperCase()).width;
        page.ctx.font = font(size, 700);
        for (const row of table.rows) w = Math.max(w, page.ctx.measureText(row.cells[c + 1]?.text ?? "").width);
        return w + 18;
      });
      const firstW = width - figureWidths.reduce((a, b) => a + b, 0) - 8;
      /** Where column `col` (1 and up) ends: the page's right, less the columns after it. */
      const edge = (col: number) => right - 4 - figureWidths.slice(col).reduce((a, b) => a + b, 0);

      const drawHeadings = () => {
        table.columns.forEach((heading, c) => {
          const x = c === 0 ? MARGIN + 4 : edge(c);
          text(heading.toUpperCase(), x, y + 10, 7.5, { color: ink.muted, weight: 600, align: c === 0 ? "left" : "right" });
        });
        y += 15;
        rule(y, ink.rule, 0.75);
        y += 3;
      };

      // The title stays with its first rows: never alone at the foot of a page.
      breakIfNeeded(18 + 18 + lineH * 2 + 8);
      text(table.title, MARGIN, y + 11, 11, { weight: 600 });
      y += 20;
      drawHeadings();

      for (const row of table.rows) {
        page.ctx.font = font(size, row.total ? 700 : 400);
        const lines = wrapText((s) => page.ctx.measureText(s).width, row.cells[0]?.text ?? "", firstW);
        const rowH = lines.length * lineH + 6;
        if (breakIfNeeded(rowH + (row.total ? 4 : 0))) drawHeadings();
        if (row.total) {
          rule(y, ink.rule, 1.25);
          y += 2;
        }
        lines.forEach((line, i) => text(line, MARGIN + 4, y + 11 + i * lineH, size, { weight: row.total ? 700 : 400 }));
        row.cells.slice(1).forEach((cell, c) => {
          text(cell.text, edge(c + 1), y + 11, size, { weight: row.total ? 700 : 400, color: toneColor(cell.tone), align: "right" });
        });
        y += rowH;
        if (!row.total) rule(y - 2, ink.hairline, 0.5);
      }
      y += 16;
    }
  }

  // Page numbers last, once the count is known.
  pages.forEach((p, i) => {
    p.ctx.font = font(8);
    p.ctx.fillStyle = ink.muted;
    p.ctx.textAlign = "center";
    p.ctx.fillText(doc.pageLabel(i + 1, pages.length), PAGE_W / 2, PAGE_H - MARGIN + 10);
  });
  return pages.map((p) => p.canvas);
}

// ─── The file ───────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/**
 * A PDF with one full-page JPEG per page. The format needs nothing more: a
 * catalog, a page tree, and per page an image and the one line that draws it.
 */
export function pdfFromJpegs(jpegs: { bytes: Uint8Array; width: number; height: number }[]): Blob {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  // Objects: 1 catalog, 2 page tree, then per page: page, image, contents.
  const pageIds = jpegs.map((_, i) => 3 + i * 3);
  push("%PDF-1.4\n%âãÏÓ\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${jpegs.length} >>`));
  jpegs.forEach((jpeg, i) => {
    const pageId = pageIds[i];
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    object(pageId, () =>
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`),
    );
    object(imageId, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${jpeg.width} /Height ${jpeg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.bytes.length} >>\nstream\n`);
      push(jpeg.bytes);
      push("\nendstream");
    });
    const draw = `q ${PAGE_W} 0 0 ${PAGE_H} 0 0 cm /Im0 Do Q`;
    object(contentId, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  });

  const xrefAt = length;
  const count = 3 + jpegs.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

const jpegOf = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("The page could not be drawn."));
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );

/** The whole file, drawn and encoded. */
export async function buildStatementPdf(doc: PdfStatement, ink: PdfInk = readPaperInk()): Promise<Blob> {
  const canvases = drawStatement(doc, ink);
  const jpegs = [];
  for (const canvas of canvases) {
    jpegs.push({ bytes: await jpegOf(canvas), width: canvas.width, height: canvas.height });
    // Let go of each page's pixels once it is encoded: a phone has little memory to spare.
    canvas.width = canvas.height = 0;
  }
  return pdfFromJpegs(jpegs);
}

/**
 * Hands the file over: the share sheet where the device has one for files
 * (iOS, Android — Save to Files, Mail, Print), a download everywhere else.
 * Resolves "shared", "downloaded", or "cancelled" when the sheet was closed.
 * Throws a NotAllowedError when the share sheet wants a fresh tap — the
 * caller then offers a button for it.
 */
export async function deliverPdf(blob: Blob, fileName: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = typeof File !== "undefined" ? new File([blob], fileName, { type: "application/pdf" }) : undefined;
  if (file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return "cancelled";
      if ((error as DOMException)?.name === "NotAllowedError") throw error;
      // Anything else: fall through to a plain download.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for the download to have started from it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
