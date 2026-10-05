/**
 * The Expenditure Request Form as a PDF: plain data in, bytes out. No database, no
 * formatting of money or dates (the data arrives as the words to print), so what the
 * page shows is decided once, in `pr-pdf-data.ts`, and drawn here.
 *
 * A4, real table grid lines, text wrapped inside cells, rows that flow onto a further page
 * with the table's header repeated. Standard Helvetica: it encodes the Latin characters
 * English and Malay use, and `printable` replaces any character it cannot encode rather
 * than letting the PDF library throw.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export interface PrTableRow {
  cells: string[];
  /// Printed in bold (the TOTAL row).
  strong?: boolean;
}

export interface PrPdfData {
  organisationName: string;
  /// PNG or JPEG bytes. Other types (WebP) cannot be embedded and are left out by the loader.
  logo: { bytes: Uint8Array; type: "png" | "jpeg" } | null;
  title: string;
  reference: string;
  raisedOn: string;
  /// Finance-system numbers, only where the requisition still has them: `[label, value]`.
  financeNumbers: [string, string][];
  /// The word marking the figures, from the product's own rule (SULIT).
  sulitMark: string;
  purchaseType: string;
  purpose: {
    title: string;
    estimatedCost: string;
    supplier: string;
    receivingLocation: string;
    justification: string;
    needStatement: string;
  };
  budget: { headers: string[]; row: string[] };
  items: { headers: string[]; rows: PrTableRow[] };
  approvals: { headers: string[]; rows: string[][] };
  notesLabel: string;
  footerRule: string;
  generated: string;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 36;
const FOOTER_H = 44;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.35, 0.4, 0.47);
const GRID = rgb(0.45, 0.5, 0.58);
const SHADE = rgb(0.93, 0.94, 0.96);

/// Characters the standard fonts lack, written as the nearest ones they have.
const SUBSTITUTES: Record<string, string> = {
  "−": "-", // minus sign
  "‐": "-",
  "‑": "-",
  "‒": "-",
  " ": " ",
  " ": " ",
  " ": " ",
  "​": "",
  "→": "->",
  "≤": "<=",
  "≥": ">=",
};

/// Text the font can encode: known substitutes applied, control characters dropped, and any
/// other character it cannot draw shown as "?" (visible, rather than silently missing).
export function printable(font: PDFFont, text: string): string {
  const known = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (cp === 10) out += "\n";
    else if (cp < 32 || cp === 127) out += cp === 9 ? " " : "";
    else if (known.has(cp)) out += ch;
    else out += SUBSTITUTES[ch] ?? "?";
  }
  return out;
}

/// Lines of text that fit a width: words kept whole where they fit, long words broken.
export function wrap(font: PDFFont, size: number, width: number, text: string): string[] {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/ +/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (fits(next)) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      let rest = word;
      while (!fits(rest)) {
        let n = rest.length;
        while (n > 1 && !fits(rest.slice(0, n))) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

class Sheet {
  page!: PDFPage;
  y = 0; // distance from the top of the page
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = MARGIN;
  }
  get width() {
    return A4[0] - 2 * MARGIN;
  }
  get bottom() {
    return A4[1] - MARGIN - FOOTER_H;
  }
  /// Make room for `h` more, on a new page when it does not fit.
  room(h: number) {
    if (this.y + h > this.bottom) this.newPage();
  }
  text(s: string, x: number, size: number, o: { bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center"; width?: number } = {}) {
    const font = o.bold ? this.bold : this.font;
    const t = printable(font, s);
    const w = font.widthOfTextAtSize(t, size);
    const left = o.align === "right" ? x + (o.width ?? 0) - w : o.align === "center" ? x + ((o.width ?? 0) - w) / 2 : x;
    this.page.drawText(t, { x: left, y: A4[1] - this.y - size, size, font, color: o.color ?? INK });
  }
  rule(x1: number, x2: number, y: number, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: A4[1] - y }, end: { x: x2, y: A4[1] - y }, thickness, color: GRID });
  }
}

const LEAD = 1.28;

/// A heading, kept with what follows it.
function heading(s: Sheet, text: string) {
  s.room(16 + 40);
  s.y += 8;
  s.text(text, MARGIN, 10.5, { bold: true });
  s.y += 16;
}

interface Column {
  title: string;
  /// Share of the table's width.
  share: number;
  align?: "left" | "right";
}

const SIZE = 8.5;
const PAD_X = 4;
const PAD_Y = 3.5;

/**
 * A ruled table. A row is never split across pages; one that is taller than a whole page is
 * cut with an ellipsis rather than dropped. The header repeats on every page the table
 * reaches.
 */
function table(s: Sheet, columns: Column[], rows: PrTableRow[]) {
  const widths = columns.map((c) => c.share * s.width);
  const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const lineH = SIZE * LEAD;
  const maxLines = Math.floor((s.bottom - MARGIN - 2 * PAD_Y - 2 * lineH) / lineH);

  const cellLines = (font: PDFFont, i: number, text: string) => {
    let lines = wrap(font, SIZE, widths[i] - 2 * PAD_X, printable(font, text));
    if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].slice(0, -1)}...`];
    return lines;
  };

  const drawRow = (cells: string[], style: { bold?: boolean; shade?: boolean; head?: boolean }) => {
    const font = style.bold ? s.bold : s.font;
    const lines = cells.map((c, i) => cellLines(font, i, c));
    const h = Math.max(...lines.map((l) => l.length), 1) * lineH + 2 * PAD_Y;
    return { lines, h, font, style };
  };
  const paint = (r: ReturnType<typeof drawRow>) => {
    const top = s.y;
    if (r.style.shade) s.page.drawRectangle({ x: MARGIN, y: A4[1] - top - r.h, width: s.width, height: r.h, color: SHADE });
    r.lines.forEach((ls, i) => {
      s.page.drawRectangle({ x: xs[i], y: A4[1] - top - r.h, width: widths[i], height: r.h, borderColor: GRID, borderWidth: 0.6 });
      ls.forEach((l, n) => {
        const right = columns[i].align === "right" && !r.style.head;
        s.y = top + PAD_Y + n * lineH;
        s.text(l, xs[i] + PAD_X, SIZE, { bold: r.style.bold, align: right ? "right" : "left", width: widths[i] - 2 * PAD_X });
      });
    });
    s.y = top + r.h;
  };

  const head = drawRow(columns.map((c) => c.title), { bold: true, shade: true, head: true });
  const body = rows.map((r) => drawRow(r.cells, { bold: r.strong }));
  s.room(head.h + (body[0]?.h ?? 0));
  paint(head);
  for (const r of body) {
    if (s.y + r.h > s.bottom) {
      s.newPage();
      paint(head);
    }
    paint(r);
  }
}

/// A two-column table of label and value (section 1).
function facts(s: Sheet, rows: [string, string][]) {
  const lw = 128;
  for (const [label, value] of rows) {
    const lines = wrap(s.font, 9.5, s.width - lw - 2 * PAD_X, printable(s.font, value || " "));
    const h = Math.max(lines.length, 1) * 9.5 * LEAD + 2 * PAD_Y;
    s.room(h);
    const top = s.y;
    s.page.drawRectangle({ x: MARGIN, y: A4[1] - top - h, width: lw, height: h, color: SHADE, borderColor: GRID, borderWidth: 0.6 });
    s.page.drawRectangle({ x: MARGIN + lw, y: A4[1] - top - h, width: s.width - lw, height: h, borderColor: GRID, borderWidth: 0.6 });
    s.y = top + PAD_Y;
    s.text(label, MARGIN + PAD_X, 9, { bold: true });
    lines.forEach((l, n) => {
      s.y = top + PAD_Y + n * 9.5 * LEAD;
      s.text(l, MARGIN + lw + PAD_X, 9.5);
    });
    s.y = top + h;
  }
}

async function embedLogo(doc: PDFDocument, logo: PrPdfData["logo"]): Promise<PDFImage | null> {
  if (!logo) return null;
  try {
    return logo.type === "png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
  } catch {
    return null; // a logo that will not embed must not stop the form
  }
}

export async function buildPrPdf(data: PrPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${data.title} (${data.reference})`);
  doc.setProducer("Procurement portal");
  doc.setCreator("Procurement portal");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = new Sheet(doc, font, bold);

  // ---- header: organisation (left), reference and date (right), the title between rules
  const logo = await embedLogo(doc, data.logo);
  const top = s.y;
  let textX = MARGIN;
  if (logo) {
    const scale = Math.min(110 / logo.width, 44 / logo.height, 1);
    const w = logo.width * scale;
    const h = logo.height * scale;
    s.page.drawImage(logo, { x: MARGIN, y: A4[1] - top - h, width: w, height: h });
    textX = MARGIN + w + 10;
  }
  const rightW = 230;
  const nameLines = wrap(bold, 12, s.width - rightW - (textX - MARGIN) - 10, printable(bold, data.organisationName));
  nameLines.slice(0, 3).forEach((l, i) => {
    s.y = top + i * 12 * LEAD;
    s.text(l, textX, 12, { bold: true });
  });
  // right block
  const right: [string, string, boolean][] = [
    ["Ref:", data.reference, true],
    ["Raised on:", data.raisedOn, false],
    ...data.financeNumbers.map(([k, v]) => [`${k}:`, v, false] as [string, string, boolean]),
  ];
  const rightEdge = MARGIN + s.width;
  // the SULIT mark
  const markW = bold.widthOfTextAtSize(printable(bold, data.sulitMark), 8) + 10;
  s.page.drawRectangle({ x: rightEdge - markW, y: A4[1] - top - 13, width: markW, height: 13, borderColor: INK, borderWidth: 0.8 });
  s.y = top + 2.5;
  s.text(data.sulitMark, rightEdge - markW, 8, { bold: true, align: "center", width: markW });
  let ry = top + 19;
  for (const [k, v, strong] of right) {
    const value = printable(strong ? bold : font, v);
    const vw = (strong ? bold : font).widthOfTextAtSize(value, 9);
    s.y = ry;
    s.text(value, rightEdge - vw, 9, { bold: strong });
    s.text(k, rightEdge - vw - 4 - font.widthOfTextAtSize(printable(font, k), 9), 9, { color: MUTED });
    ry += 9 * LEAD + 1;
  }
  s.y = Math.max(top + (logo ? 46 : 0), top + nameLines.slice(0, 3).length * 12 * LEAD, ry) + 6;
  s.rule(MARGIN, MARGIN + s.width, s.y, 1.2);
  s.y += 8;
  s.text("EXPENDITURE REQUEST FORM", MARGIN, 14, { bold: true, align: "center", width: s.width });
  s.y += 14 * LEAD + 4;
  s.rule(MARGIN, MARGIN + s.width, s.y, 1.2);
  s.y += 10;

  s.text("PURCHASE TYPE:", MARGIN, 9.5, { bold: true });
  s.text(data.purchaseType, MARGIN + 100, 9.5);
  s.y += 9.5 * LEAD + 4;

  // ---- 1. purpose
  heading(s, "1. PURPOSE OF EXPENDITURE");
  facts(s, [
    ["Title", data.purpose.title],
    ["Estimated cost (RM)", data.purpose.estimatedCost],
    ["Supplier", data.purpose.supplier],
    ["Receiving location", data.purpose.receivingLocation],
    ["Justification", data.purpose.justification],
    ["Need statement", data.purpose.needStatement],
  ]);

  // ---- 2. budget
  heading(s, "2. BUDGET ALLOCATION");
  s.text("2.1", MARGIN, 9.5, { bold: true });
  s.y += 9.5 * LEAD + 3;
  const b = data.budget;
  table(
    s,
    b.headers.map((title, i) => ({ title, share: [0.22, 0.18, 0.15, 0.15, 0.15, 0.15][i], align: i >= 2 ? ("right" as const) : ("left" as const) })),
    [{ cells: b.row }],
  );
  s.y += 8;
  s.room(40);
  s.text("2.2 ORDER ITEMS", MARGIN, 9.5, { bold: true });
  s.y += 9.5 * LEAD + 3;
  table(
    s,
    data.items.headers.map((title, i) => ({ title, share: [0.05, 0.13, 0.13, 0.27, 0.11, 0.07, 0.07, 0.17][i], align: [4, 5, 7].includes(i) ? ("right" as const) : ("left" as const) })),
    data.items.rows,
  );

  // ---- 3. approvals
  heading(s, "3. APPROVALS");
  table(
    s,
    data.approvals.headers.map((title, i) => ({ title, share: [0.05, 0.19, 0.14, 0.16, 0.17, 0.29][i] })),
    data.approvals.rows.map((cells) => ({ cells })),
  );

  // ---- notes: an empty box
  s.y += 4;
  s.room(24 + 48); // the heading stays with its box
  heading(s, data.notesLabel);
  s.page.drawRectangle({ x: MARGIN, y: A4[1] - s.y - 48, width: s.width, height: 48, borderColor: GRID, borderWidth: 0.6 });
  s.y += 48;

  // ---- footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const y = A4[1] - (A4[1] - MARGIN - FOOTER_H) - 8;
    p.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: MARGIN + s.width, y: y + 2 }, thickness: 0.6, color: GRID });
    const rule = wrap(font, 7.5, s.width, printable(font, data.footerRule));
    rule.forEach((l, n) => p.drawText(l, { x: MARGIN, y: y - 9 - n * 9, size: 7.5, font, color: INK }));
    const gen = printable(font, data.generated);
    const base = y - 9 - rule.length * 9;
    p.drawText(gen, { x: MARGIN, y: base, size: 7.5, font, color: MUTED });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: MARGIN + s.width - font.widthOfTextAtSize(pn, 7.5), y: base, size: 7.5, font, color: MUTED });
  });

  return doc.save({ useObjectStreams: false });
}
