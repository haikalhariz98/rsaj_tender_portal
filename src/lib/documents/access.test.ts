import { describe, expect, it } from "vitest";

import { dispositionFilename, downloadDecision } from "./access";
import { reclassifyFault, reclassifyKind } from "./classification";
import { ACCESS_STATEMENT, documentFaultText, DOWNLOAD_REFUSAL_TEXT, SCAN_LABEL } from "./labels";

describe("which bytes are served before sign-in (OD-2, OD-4)", () => {
  it("SULIT is listed, never served", () => {
    expect(downloadDecision({ classification: "SULIT", scanState: "NOT_SCANNED" })).toEqual({ allow: false, reason: "SULIT" });
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
    expect(ACCESS_STATEMENT).toMatch(/no sign-in/);
    expect(ACCESS_STATEMENT).not.toMatch(/restricted|secure|confidential/i);
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
  it("an empty name falls back to a plain one", () => {
    expect(dispositionFilename("...", "png")).toContain(`filename="document.png"`);
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
    expect(text).toMatch(/new document/);
    expect(text).toMatch(/withdraw/);
    expect(reclassifyFault("SULIT", "PUBLIC", "x").map((x) => x.code)).toEqual(["DOWNGRADE_FROM_SULIT"]);
  });
  it("a set classification is never unset, and an unchanged one is not a change", () => {
    expect(reclassifyFault("INTERNAL", null, "x").map((x) => x.code)).toEqual(["CANNOT_UNSET"]);
    expect(reclassifyFault("INTERNAL", "INTERNAL", "x").map((x) => x.code)).toEqual(["UNCHANGED"]);
  });
});
