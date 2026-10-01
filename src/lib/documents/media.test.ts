import { describe, expect, it } from "vitest";

import { documentFaultText } from "./labels";
import { mediaFault, sniffMediaType, typeFromHeader, typeFromName, unknownPolicyTypes } from "./media";
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
  it("a policy may list CSV", () => {
    expect(unknownPolicyTypes(["text/csv"])).toEqual([]);
  });
});
