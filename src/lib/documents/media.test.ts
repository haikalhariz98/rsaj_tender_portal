import { describe, expect, it } from "vitest";

import ExcelJS from "exceljs";

import { documentFaultText } from "./labels";
import { ARCHIVE_TAIL_BYTES, DOCX_TYPE, mediaFault, ooxmlTypeOf, sniffMediaType, typeFromHeader, typeFromName, unknownPolicyTypes, XLSX_TYPE } from "./media";
import type { StorePolicy } from "./types";

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...Buffer.from(x, "latin1")] : [x])));
const PDF = bytes("%PDF-1.4\n%âãÏÓ\n1 0 obj");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, "JFIF");
const TIFF_LE = bytes(0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0);
const TIFF_BE = bytes(0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 20, 0, "[Content_Types].xml");
const HTML = bytes(0xef, 0xbb, 0xbf, "  <!DOCTYPE html><html><script>alert(1)</script>");
const SVG = bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

const policy: StorePolicy = { allowedMediaTypes: ["application/pdf", "image/png", "image/jpeg"], maxBytes: 20n * 1024n * 1024n };

describe("sniffing a file's type from its own bytes (NFR-SEC-007)", () => {
  it("knows PDF, PNG, JPEG and TIFF (both byte orders)", () => {
    expect(sniffMediaType(PDF)).toBe("application/pdf");
    expect(sniffMediaType(PNG)).toBe("image/png");
    expect(sniffMediaType(JPEG)).toBe("image/jpeg");
    expect(sniffMediaType(TIFF_LE)).toBe("image/tiff");
    expect(sniffMediaType(TIFF_BE)).toBe("image/tiff");
  });
  it("recognises ZIP, HTML and SVG only to refuse them, and knows nothing else", () => {
    expect(sniffMediaType(ZIP)).toBe("application/zip");
    expect(sniffMediaType(HTML)).toBe("text/html");
    expect(sniffMediaType(SVG)).toBe("image/svg+xml");
    expect(sniffMediaType(bytes("Just some text"))).toBeNull();
    expect(sniffMediaType(new Uint8Array(0))).toBeNull();
  });
  it("a PDF signature anywhere but the start is not a PDF", () => {
    expect(sniffMediaType(bytes(" %PDF-1.4"))).toBeNull();
  });
});

describe("refusing what the policy or the bytes do not allow", () => {
  it("a PDF header with a .png name is refused, naming both", () => {
    const f = mediaFault(sniffMediaType(PDF), { filename: "scan.png" }, policy);
    expect(f).toEqual({ code: "DECLARED_TYPE_MISMATCH", level: "block", data: { sniffed: "application/pdf", declared: "image/png" } });
    const text = documentFaultText(f!);
    expect(text).toMatch(/PDF/);
    expect(text).toMatch(/PNG image/);
  });
  it("a PNG called .pdf is refused the same way", () => {
    expect(mediaFault(sniffMediaType(PNG), { filename: "letter.pdf" }, policy)).toMatchObject({ code: "DECLARED_TYPE_MISMATCH", data: { sniffed: "image/png", declared: "application/pdf" } });
  });
  it("a declared Content-Type that disagrees with the bytes is refused; octet-stream declares nothing", () => {
    expect(mediaFault(sniffMediaType(PDF), { filename: "a.pdf", contentType: "image/png" }, policy)).toMatchObject({ code: "DECLARED_TYPE_MISMATCH" });
    expect(mediaFault(sniffMediaType(PDF), { filename: "a.pdf", contentType: "application/octet-stream" }, policy)).toBeNull();
    expect(mediaFault(sniffMediaType(PDF), { filename: "a.pdf", contentType: "application/pdf; charset=binary" }, policy)).toBeNull();
  });
  it("a ZIP (and so any Office file) is refused, saying to save it as a PDF", () => {
    const f = mediaFault(sniffMediaType(ZIP), { filename: "minutes.docx" }, policy);
    expect(f?.code).toBe("ARCHIVE_NOT_ACCEPTED");
    expect(documentFaultText(f!)).toMatch(/PDF/);
  });
  it("HTML and SVG are never accepted, even if a policy listed them", () => {
    const lax = { ...policy, allowedMediaTypes: [...policy.allowedMediaTypes, "text/html", "image/svg+xml"] };
    expect(mediaFault(sniffMediaType(HTML), { filename: "x.html" }, lax)?.code).toBe("MARKUP_NEVER_ACCEPTED");
    expect(mediaFault(sniffMediaType(SVG), { filename: "x.svg" }, lax)?.code).toBe("MARKUP_NEVER_ACCEPTED");
  });
  it("a known type the policy leaves out is refused naming where the rules are set", () => {
    const f = mediaFault(sniffMediaType(TIFF_LE), { filename: "scan.tif" }, policy);
    expect(f?.code).toBe("TYPE_NOT_ALLOWED");
    expect(documentFaultText(f!)).toMatch(/Upload rules/);
  });
  it("an unset policy refuses before anything about the file, naming the setting", () => {
    const f = mediaFault(sniffMediaType(PDF), { filename: "a.pdf" }, { allowedMediaTypes: [], maxBytes: 1n });
    expect(f?.code).toBe("TYPES_NOT_SET");
    expect(documentFaultText(f!)).toMatch(/Configuration, Documents, Upload rules/);
  });
  it("a name with no extension the portal knows is refused", () => {
    expect(mediaFault(sniffMediaType(PDF), { filename: "scan" }, policy)?.code).toBe("NAME_WITHOUT_TYPE");
    expect(mediaFault(sniffMediaType(PDF), { filename: "scan.exe" }, policy)?.code).toBe("NAME_WITHOUT_TYPE");
  });
  it("matching bytes, name and declaration pass", () => {
    expect(mediaFault(sniffMediaType(JPEG), { filename: "PHOTO.JPG", contentType: "image/jpeg" }, policy)).toBeNull();
    expect(mediaFault(sniffMediaType(PNG), { filename: "page.png", contentType: "image/png" }, policy)).toBeNull();
  });
  it("names and headers normalise", () => {
    expect(typeFromName("a.JPEG")).toBe("image/jpeg");
    expect(typeFromName("a.tiff")).toBe("image/tiff");
    expect(typeFromName("a.pdf.exe")).toBeNull();
    expect(typeFromHeader("image/jpg")).toBe("image/jpeg");
    expect(typeFromHeader("")).toBeNull();
  });
  it("a policy may only list types the portal can recognise", () => {
    expect(unknownPolicyTypes(["application/pdf", "application/msword"])).toEqual(["application/msword"]);
  });
});

describe("a CSV is told by its bytes (6.2 Q-3, the bill of quantities as received)", () => {
  const CSV = bytes("Section,Item,Description,Unit,Kind,Quantity,Rate\r\n1,1.1,Preliminaries,item,MEASURED,1,45000.00\r\n");
  const csvPolicy: StorePolicy = { ...policy, allowedMediaTypes: [...policy.allowedMediaTypes, "text/csv"] };

  it("clean UTF-8 whose first line has a comma is a CSV, with or without a byte-order mark", () => {
    expect(sniffMediaType(CSV)).toBe("text/csv");
    expect(sniffMediaType(bytes(0xef, 0xbb, 0xbf, "a,b\n1,2"))).toBe("text/csv");
    expect(sniffMediaType(bytes("Kerja paip,m,1250.5\n"))).toBe("text/csv");
  });
  it("text with no comma on its first line, binary bytes and broken UTF-8 are not", () => {
    expect(sniffMediaType(bytes("Just some text"))).toBeNull();
    expect(sniffMediaType(bytes("heading only\na,b"))).toBeNull();
    expect(sniffMediaType(bytes("a,b", 0x00, "c"))).toBeNull();
    expect(sniffMediaType(bytes("a,b", 0x1b, "[31m"))).toBeNull();
    expect(sniffMediaType(bytes("a,b", 0xff, 0xfe))).toBeNull();
    expect(sniffMediaType(bytes("   \n  "))).toBeNull();
  });
  it("a multi-byte character cut off at the end of the window is not held against the file", () => {
    const head = bytes("a,b\n", ..."é".repeat(300).split("").flatMap((c) => [...Buffer.from(c, "utf8")])).subarray(0, 511);
    expect(sniffMediaType(head)).toBe("text/csv");
  });
  it("markup named .csv is still refused as markup", () => {
    const html = bytes("<html><body>a,b</body></html>");
    expect(sniffMediaType(html)).toBe("text/html");
    expect(mediaFault(sniffMediaType(html), { filename: "bill.csv" }, csvPolicy)?.code).toBe("MARKUP_NEVER_ACCEPTED");
  });
  it("is refused where the policy leaves CSV out, and accepted where it lists it", () => {
    expect(mediaFault(sniffMediaType(CSV), { filename: "bill.csv" }, policy)?.code).toBe("TYPE_NOT_ALLOWED");
    expect(mediaFault(sniffMediaType(CSV), { filename: "bill.csv", contentType: "text/csv" }, csvPolicy)).toBeNull();
  });
  it("what browsers declare for a .csv is taken as CSV; a CSV called .pdf is not", () => {
    for (const declared of ["application/vnd.ms-excel", "text/plain", "application/csv", "text/x-csv"]) {
      expect(mediaFault(sniffMediaType(CSV), { filename: "bill.csv", contentType: declared }, csvPolicy), declared).toBeNull();
    }
    expect(mediaFault(sniffMediaType(CSV), { filename: "bill.pdf" }, csvPolicy)?.code).toBe("DECLARED_TYPE_MISMATCH");
    expect(mediaFault(sniffMediaType(PDF), { filename: "a.pdf", contentType: "application/vnd.ms-excel" }, csvPolicy)?.code).toBe("DECLARED_TYPE_MISMATCH");
    expect(typeFromName("BILL.CSV")).toBe("text/csv");
  });
  it("the CSV names are read as CSV only when the bytes are CSV; any other file keeps the type it was sent as", () => {
    expect(typeFromHeader("text/plain", "text/csv")).toBe("text/csv");
    expect(typeFromHeader("application/vnd.ms-excel", "text/csv")).toBe("text/csv");
    expect(typeFromHeader("text/plain", "application/pdf")).toBe("text/plain");
    expect(typeFromHeader("application/vnd.ms-excel")).toBe("application/vnd.ms-excel");
    const f = mediaFault(sniffMediaType(PDF), { filename: "a.pdf", contentType: "text/plain" }, csvPolicy);
    expect(f).toEqual({ code: "DECLARED_TYPE_MISMATCH", level: "block", data: { sniffed: "application/pdf", declared: "text/plain" } });
    expect(documentFaultText(f!)).toBe("The file's contents are a PDF, but it was sent as a plain text file. It was not stored. Check it is the file you meant, and give it its right name.");
    expect(documentFaultText(mediaFault(sniffMediaType(PDF), { filename: "a.pdf", contentType: "application/vnd.ms-excel" }, csvPolicy)!)).toMatch(/sent as an Excel file/);
  });
  it("a policy may list CSV", () => {
    expect(unknownPolicyTypes(["text/csv"])).toEqual([]);
  });
});

/** A ZIP made by hand: stored entries, a central directory and its end record. Enough for the names to be read; nothing here is ever unpacked. */
function zipOf(names: string[], opts: { flags?: number; comment?: number; zip64?: boolean } = {}): Uint8Array {
  const parts: number[][] = [];
  const central: number[][] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  const u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const name of names) {
    const nameBytes = [...Buffer.from(name, "utf8")];
    const local = [...u32(0x04034b50), ...u16(20), ...u16(opts.flags ?? 0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u16(nameBytes.length), ...u16(0), ...nameBytes];
    parts.push(local);
    central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(opts.flags ?? 0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes]);
    offset += local.length;
  }
  const cd = central.flat();
  const eocd = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(names.length), ...u16(names.length), ...u32(cd.length), ...u32(opts.zip64 ? 0xffffffff : offset), ...u16(opts.comment ?? 0)];
  return new Uint8Array([...parts.flat(), ...cd, ...eocd, ...new Array(opts.comment ?? 0).fill(0x20)]);
}
const tailOf = (b: Uint8Array) => b.subarray(Math.max(0, b.length - ARCHIVE_TAIL_BYTES));

describe("a workbook or a Word document is told from a ZIP by the names its archive lists (SR-09, SR-11)", () => {
  const xlsxPolicy: StorePolicy = { ...policy, allowedMediaTypes: [...policy.allowedMediaTypes, XLSX_TYPE, DOCX_TYPE] };
  async function workbook(): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bill of quantities");
    ws.addRow(["Section", "Item", "Description", "Unit", "Quantity"]);
    ws.addRow([1, "1.1", "Preliminaries", "item", 1]);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it("a real workbook is an Excel workbook, though its first bytes are only a ZIP's", async () => {
    const book = await workbook();
    expect(sniffMediaType(book.subarray(0, 512))).toBe("application/zip");
    expect(ooxmlTypeOf(tailOf(book), book.length)).toBe(XLSX_TYPE);
  });
  it("a Word document is told by word/document.xml", () => {
    const docx = zipOf(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"]);
    expect(ooxmlTypeOf(tailOf(docx), docx.length)).toBe(DOCX_TYPE);
  });
  it("anything else stays an archive: another ZIP, a macro-enabled workbook, a file that is both, an encrypted one, ZIP64, or no directory at all", () => {
    const t = (names: string[], opts?: Parameters<typeof zipOf>[1]) => {
      const z = zipOf(names, opts);
      return ooxmlTypeOf(tailOf(z), z.length);
    };
    expect(t(["notes.txt", "photo.jpg"])).toBeNull();
    expect(t(["[Content_Types].xml", "xl/workbook.xml", "xl/vbaProject.bin"])).toBeNull();
    expect(t(["[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"])).toBeNull();
    expect(t(["[Content_Types].xml", "xl/workbook.xml", "word/document.xml"])).toBeNull();
    expect(t(["xl/workbook.xml"])).toBeNull();
    expect(t(["[Content_Types].xml", "xl/workbook.xml"], { flags: 1 })).toBeNull();
    expect(t(["[Content_Types].xml", "xl/workbook.xml"], { zip64: true })).toBeNull();
    expect(ooxmlTypeOf(bytes(0x50, 0x4b, 0x03, 0x04, 1, 2, 3), 7)).toBeNull();
    expect(ooxmlTypeOf(new Uint8Array(0), 0)).toBeNull();
  });
  it("a directory that does not fit the bytes given is not guessed at", () => {
    const z = zipOf(["[Content_Types].xml", "xl/workbook.xml"]);
    expect(ooxmlTypeOf(z.subarray(z.length - 60), z.length + 10_000)).toBeNull();
  });
  it("is stored where the policy lists the type, under a matching name, and refused otherwise", async () => {
    const book = await workbook();
    const sniffed = ooxmlTypeOf(tailOf(book), book.length);
    expect(mediaFault(sniffed, { filename: "BQ-DEMO-0026.xlsx", contentType: XLSX_TYPE }, xlsxPolicy)).toBeNull();
    // Windows browsers may send the older Excel name for it.
    expect(mediaFault(sniffed, { filename: "bq.xlsx", contentType: "application/vnd.ms-excel" }, xlsxPolicy)).toBeNull();
    expect(mediaFault(sniffed, { filename: "bq.xlsx", contentType: "application/octet-stream" }, xlsxPolicy)).toBeNull();
    // Left out of the policy: refused, naming where the rules are set.
    const left = mediaFault(sniffed, { filename: "bq.xlsx" }, policy);
    expect(left).toMatchObject({ code: "TYPE_NOT_ALLOWED" });
    expect(documentFaultText(left!)).toMatch(/Excel workbook \(\.xlsx\).*Upload rules/);
    // A workbook called .csv or .pdf is a mismatch, naming both.
    expect(mediaFault(sniffed, { filename: "bq.csv" }, xlsxPolicy)).toMatchObject({ code: "DECLARED_TYPE_MISMATCH", data: { sniffed: XLSX_TYPE, declared: "text/csv" } });
    expect(mediaFault(sniffed, { filename: "bq.xls" }, xlsxPolicy)?.code).toBe("NAME_WITHOUT_TYPE");
    // A bare ZIP is still refused as the archive it is.
    expect(mediaFault("application/zip", { filename: "bq.xlsx" }, xlsxPolicy)?.code).toBe("ARCHIVE_NOT_ACCEPTED");
  });
  it("names and extensions are known", () => {
    expect(typeFromName("Bill.XLSX")).toBe(XLSX_TYPE);
    expect(typeFromName("Form.docx")).toBe(DOCX_TYPE);
    expect(unknownPolicyTypes([XLSX_TYPE, DOCX_TYPE, "application/msword"])).toEqual(["application/msword"]);
  });
});
