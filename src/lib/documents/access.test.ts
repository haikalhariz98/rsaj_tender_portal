import { describe, expect, it } from "vitest";

import { dispositionFilename, downloadDecision, filenameFault, MAX_FILENAME_CODE_POINTS, MAX_SERVED_FILENAME_CODE_POINTS, servedFilename } from "./access";
import { reclassifyFault, reclassifyKind } from "./classification";
import { ACCESS_STATEMENT, documentFaultText, DOWNLOAD_REFUSAL_TEXT, SCAN_LABEL } from "./labels";

describe("which bytes are served (OD-2, OD-4; Phase 3b: SULIT to the entitled)", () => {
  // Phase 3b, a deliberate change to this test (logged): "SULIT is listed, never served" was true while nothing could say who was reading. It is served to a reader the record it hangs on
  // admits (`entitled`), and to no one else, and a caller that has not asked is refused.
  it("SULIT is served only to an entitled reader; a caller that has not asked, or an unentitled one, is refused", () => {
    expect(downloadDecision({ classification: "SULIT", scanState: "NOT_SCANNED" })).toEqual({ allow: false, reason: "SULIT" });
    expect(downloadDecision({ classification: "SULIT", scanState: "NOT_SCANNED", entitled: false })).toEqual({ allow: false, reason: "SULIT" });
    expect(downloadDecision({ classification: "SULIT", scanState: "NOT_SCANNED", entitled: null })).toEqual({ allow: false, reason: "SULIT" });
    expect(downloadDecision({ classification: "SULIT", scanState: "NOT_SCANNED", entitled: true })).toEqual({ allow: true });
  });
  it("entitlement opens nothing that is unclassified or carries a threat", () => {
    expect(downloadDecision({ classification: null, scanState: "NOT_SCANNED", entitled: true })).toEqual({ allow: false, reason: "UNCLASSIFIED" });
    expect(downloadDecision({ classification: "SULIT", scanState: "THREAT", entitled: true })).toEqual({ allow: false, reason: "THREAT" });
  });
  it("an unclassified document is not served either", () => {
    expect(downloadDecision({ classification: null, scanState: "NOT_SCANNED" })).toEqual({ allow: false, reason: "UNCLASSIFIED" });
  });
  it("a version found to carry a threat is never served, whatever its class", () => {
    expect(downloadDecision({ classification: "PUBLIC", scanState: "THREAT" })).toEqual({ allow: false, reason: "THREAT" });
  });
  it("Public and Internal are served, unscanned, and the screens say both", () => {
    expect(downloadDecision({ classification: "PUBLIC", scanState: "NOT_SCANNED" })).toEqual({ allow: true });
    expect(downloadDecision({ classification: "INTERNAL", scanState: "NOT_SCANNED" })).toEqual({ allow: true });
    expect(SCAN_LABEL.NOT_SCANNED).toBe("Not scanned for malware — scanning not built");
    // Phase 3b: the statement says who opens what and that every download is logged; it still claims nothing it does not do (secure, confidential), and no longer says there is no sign-in.
    expect(ACCESS_STATEMENT).toMatch(/SULIT/);
    expect(ACCESS_STATEMENT).toMatch(/logged/);
    expect(ACCESS_STATEMENT).not.toMatch(/secure|confidential|no sign-in|until sign-in/i);
  });
  it("a refusal says it was logged", () => {
    for (const t of Object.values(DOWNLOAD_REFUSAL_TEXT)) expect(t).toMatch(/refused and logged/);
  });
});

describe("the download's file name", () => {
  it("is offered as an attachment, with control characters, quotes and paths taken out", () => {
    const h = dispositionFilename('../../etc/pa"ss\r\nwd.pdf', "pdf");
    expect(h.startsWith("attachment; ")).toBe(true);
    expect(h).not.toMatch(/[\r\n]/);
    expect(h).not.toContain("../");
    expect(h).toContain(`filename="etcpasswd.pdf"`);
  });
  it("keeps a non-ASCII name in the UTF-8 form, with an ASCII fallback", () => {
    const h = dispositionFilename("Minit mesyuarat — Ogos.pdf", "pdf");
    expect(h).toContain(`filename="Minit mesyuarat _ Ogos.pdf"`);
    expect(h).toContain("filename*=UTF-8''Minit%20mesyuarat%20%E2%80%94%20Ogos.pdf");
  });
  it("the UTF-8 form percent-encodes ' ( ) * too, so only RFC 5987 attr-chars stay bare (audit C-3)", () => {
    const h = dispositionFilename("Ali's (final) *draft*.pdf", "pdf");
    const encoded = /filename\*=UTF-8''(.+)$/.exec(h)![1];
    expect(encoded).toBe("Ali%27s%20%28final%29%20%2Adraft%2A.pdf");
    expect(encoded).toMatch(/^[A-Za-z0-9!#$&+\-.^_`|~%]+$/);
    expect(decodeURIComponent(encoded)).toBe("Ali's (final) *draft*.pdf");
  });
  it("an empty name falls back to a plain one", () => {
    expect(dispositionFilename("...", "png")).toContain(`filename="document.png"`);
  });
});

describe("the served name is built from the stored type, never the uploader's extension (audit M-1)", () => {
  it("a 176-character stem with .hta.pdf is served ending .pdf, not .hta", () => {
    const name = servedFilename("x".repeat(176) + ".hta.pdf", "pdf");
    expect(name.endsWith(".pdf")).toBe(true);
    expect(name).not.toMatch(/\.hta/);
    expect(Array.from(name).length).toBeLessThanOrEqual(MAX_SERVED_FILENAME_CODE_POINTS);
    expect(dispositionFilename("x".repeat(176) + ".hta.pdf", "pdf")).toMatch(/filename="x+\.pdf";/);
  });
  it("so does a 185-character stem, and every length around the old cut", () => {
    for (let n = 150; n <= 200; n++) {
      const name = servedFilename("x".repeat(n) + ".hta.pdf", "pdf");
      expect(name.endsWith(".pdf"), String(n)).toBe(true);
      expect(Array.from(name).length).toBeLessThanOrEqual(MAX_SERVED_FILENAME_CODE_POINTS);
    }
    expect(servedFilename("x".repeat(185) + ".hta.pdf", "pdf")).toBe("x".repeat(176) + ".pdf");
  });
  it("a short name keeps its stem and takes the stored type's extension, whatever it was sent as", () => {
    expect(servedFilename("report.pdf", "pdf")).toBe("report.pdf");
    expect(servedFilename("report.exe", "pdf")).toBe("report.pdf");
    expect(servedFilename("scan", "png")).toBe("scan.png");
    expect(servedFilename("evil.hta.pdf", "pdf")).toBe("evil.hta.pdf");
  });
  it("trims by code point, so an emoji at the cut is whole or gone", () => {
    const name = servedFilename("a".repeat(175) + "😀😀.pdf", "pdf");
    expect(name).toBe("a".repeat(175) + "😀.pdf");
    expect(Array.from(name).length).toBe(MAX_SERVED_FILENAME_CODE_POINTS);
    expect(servedFilename("a".repeat(176) + "😀.pdf", "pdf")).toBe("a".repeat(176) + ".pdf");
  });
  it("a trimmed stem does not end in a dot or a space", () => {
    expect(servedFilename("a".repeat(175) + " .b.pdf", "pdf")).toBe("a".repeat(175) + ".pdf");
  });
  it("takes out the marks that make a name read backwards", () => {
    expect(servedFilename("fdp.\u202Eexe", "pdf")).not.toMatch(/\u202e/);
  });
  it("a name over the storage limit is refused, never cut", () => {
    expect(filenameFault("a".repeat(MAX_FILENAME_CODE_POINTS))).toBeNull();
    expect(filenameFault("a".repeat(MAX_FILENAME_CODE_POINTS + 1))?.code).toBe("NAME_TOO_LONG");
    // 255 emoji are 510 UTF-16 units but 255 code points: they fit.
    expect(filenameFault("😀".repeat(MAX_FILENAME_CODE_POINTS))).toBeNull();
    expect(filenameFault("😀".repeat(MAX_FILENAME_CODE_POINTS + 1))?.code).toBe("NAME_TOO_LONG");
  });
});

describe("reclassifying a document (NFR-SEC-002)", () => {
  it("an unset classification is set once, with a reason", () => {
    expect(reclassifyFault(null, "INTERNAL", "Class was unset at upload")).toEqual([]);
    expect(reclassifyFault(null, "INTERNAL", "").map((f) => f.code)).toEqual(["REASON_REQUIRED"]);
    expect(reclassifyKind(null, "INTERNAL")).toBe("SET");
  });
  it("raising is audited with a reason", () => {
    expect(reclassifyFault("INTERNAL", "SULIT", "Contains the company estimate")).toEqual([]);
    expect(reclassifyKind("INTERNAL", "SULIT")).toBe("RAISED");
  });
  it("lowering from SULIT is refused until maker-checker, naming re-upload and withdraw", () => {
    const f = reclassifyFault("SULIT", "INTERNAL", "Declassified");
    expect(f.map((x) => x.code)).toEqual(["DOWNGRADE_FROM_SULIT"]);
    const text = documentFaultText(f[0]);
    // 0005, founder 2026-10-19: refusal shortened; it still names what blocks and the way out.
    expect(text).toMatch(/Upload it again/);
    expect(text).toMatch(/withdraw/);
    expect(reclassifyFault("SULIT", "PUBLIC", "x").map((x) => x.code)).toEqual(["DOWNGRADE_FROM_SULIT"]);
  });
  it("a set classification is never unset, and an unchanged one is not a change", () => {
    expect(reclassifyFault("INTERNAL", null, "x").map((x) => x.code)).toEqual(["CANNOT_UNSET"]);
    expect(reclassifyFault("INTERNAL", "INTERNAL", "x").map((x) => x.code)).toEqual(["UNCHANGED"]);
  });
});
