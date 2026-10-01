import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import type { BqLine } from "@/lib/scope/types";

import type { AppendixFacts } from "./appendix";
import { freezePack } from "./freeze";
import { generatedLanguages, restrictionFaults, stamped, stampFor } from "./stamp";
import type { PackPartFacts, TemplateFacts } from "./types";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

/// The customer's stamp is configuration; these words are a test's own invention.
const STAMP = { EN: "RESTRICTED TENDER: ELIGIBLE BIDDERS ONLY", MS: "TENDER TERHAD: PEMBIDA LAYAK SAHAJA" };
const template = (x: Partial<TemplateFacts> = {}): TemplateFacts => ({ id: "t", code: "form", nameEn: "Form of tender", formCode: "", revisionDate: null, bodyEn: "Tender for {{exercise.title}}.", bodyMs: "Tender untuk {{exercise.title}}.", primaryLanguage: "MS", bodyVersion: 2, ...x });
const part = (x: Partial<PackPartFacts> = {}): PackPartFacts => ({ partCode: "p2", printedNumber: "2", sortOrder: 20, label: "Form of tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "form", template: template(), state: "READY", omittedReason: "", liveUploads: 0, ...x });
const bqPart = part({ partCode: "p7", printedNumber: "7a", label: "Bill", role: "BILL_OF_QUANTITIES", source: "BQ_UNPRICED", content: "BESPOKE", template: null });
const appendixPart = part({ partCode: "p3a", printedNumber: "3a", label: "Appendix", role: "APPENDIX", source: "APPENDIX", content: "BESPOKE", template: null });
const drawings = part({ partCode: "p10", printedNumber: "10", label: "Drawings", role: "DRAWINGS", source: "UPLOAD", content: "BESPOKE", template: null, liveUploads: 1 });
const bill = { versionNo: 1, sections: [{ number: "1", title: "Works", items: [{ itemRef: "A", description: "Pipe laying", unit: "m", kind: "MEASURED", quantity: "10", rate: parseSen("10.00"), provisional: false }] as BqLine[] }] };

describe("FR-DOC-009: the restriction is answered, and its stamp is configured in every language generated", () => {
  it("unanswered is not 'unrestricted': it blocks", () => {
    expect(codes(restrictionFaults({ restricted: null, stamp: STAMP, parts: [part()] }))).toEqual(["RESTRICTION_NOT_ANSWERED"]);
  });
  it("not restricted: nothing is stamped and nothing is needed", () => {
    expect(restrictionFaults({ restricted: false, stamp: { EN: null, MS: null }, parts: [part()] })).toEqual([]);
    expect(stampFor(false, STAMP)).toBeNull();
  });
  it("restricted: the stamp is needed in each language a document is generated in", () => {
    expect(generatedLanguages([part()])).toEqual(["MS", "EN"]);
    expect(generatedLanguages([part({ template: template({ bodyMs: null }) }), bqPart])).toEqual(["EN"]);
    expect(restrictionFaults({ restricted: true, stamp: STAMP, parts: [part()] })).toEqual([]);
    expect(restrictionFaults({ restricted: true, stamp: { EN: STAMP.EN, MS: null }, parts: [part()] })).toEqual([{ code: "STAMP_NOT_SET", level: "block", data: { language: "Malay" } }]);
    expect(codes(restrictionFaults({ restricted: true, stamp: { EN: " ", MS: STAMP.MS }, parts: [part()] }))).toEqual(["STAMP_NOT_SET"]);
    // An English-only pack needs no Malay stamp.
    expect(restrictionFaults({ restricted: true, stamp: { EN: STAMP.EN, MS: null }, parts: [part({ template: template({ bodyMs: null }) })] })).toEqual([]);
  });
  it("an uploaded file is not generated here: a warning that it carries the stamp itself, never a silent pass", () => {
    expect(restrictionFaults({ restricted: true, stamp: STAMP, parts: [part(), drawings] })).toEqual([{ code: "UPLOADS_NOT_STAMPED", level: "warn", data: { count: 1 } }]);
  });
});

describe("FR-DOC-009 acceptance: a restricted exercise carries the stamp on every generated document", () => {
  const facts = {} as AppendixFacts;
  const freeze = (stamp: typeof STAMP | null) =>
    freezePack({
      parts: [{ ...part(), files: [] }, { ...bqPart, files: [] }, { ...appendixPart, files: [] }, { ...drawings, files: [{ versionId: "v", documentId: "d", versionNo: 1, sha256: "ab", title: "Drawings" }] }],
      fields: { "exercise.title": "Filter works" },
      bill: { versionId: "bq1", frozen: bill },
      appendix: { id: "ap1", facts, text: "Appendix to the Conditions of Contract" },
      stamp,
    });
  it("each generated text opens with the stamp in its own language: the form in both, the bill and the Appendix", () => {
    const { documents, manifest } = freeze(STAMP);
    expect(documents.map((d) => [d.partCode, d.language, d.renderedText.split("\n\n")[0]])).toEqual([
      ["p2", "MS", STAMP.MS],
      ["p2", "EN", STAMP.EN],
      ["p7", "EN", STAMP.EN],
      ["p3a", "EN", STAMP.EN],
    ]);
    expect(documents[0].renderedText).toBe(`${STAMP.MS}\n\nTender untuk Filter works.`);
    // The manifest says which parts the portal stamped: never the uploaded file.
    expect(manifest.map((m) => [m.partCode, m.stamped])).toEqual([["p2", true], ["p7", true], ["p3a", true], ["p10", false]]);
  });
  it("not restricted: no stamp anywhere", () => {
    const { documents, manifest } = freeze(null);
    for (const d of documents) expect(d.renderedText).not.toContain("RESTRICTED");
    expect(manifest.every((m) => m.stamped === false)).toBe(true);
  });
  it("a blank stamp adds nothing", () => {
    expect(stamped("Text", " ")).toBe("Text");
    expect(stamped("Text", null)).toBe("Text");
  });
});

describe("a restricted pack says its uploaded files are not stamped by the portal (U6)", () => {
  it("only for an upload, and only where the tender is restricted (not unanswered, not no)", async () => {
    const { uploadStampNote, UPLOADED_NOT_STAMPED } = await import("./stamp");
    expect(UPLOADED_NOT_STAMPED).toBe("Uploaded file: not stamped by the portal; check it carries the stamp");
    expect(uploadStampNote(true, "UPLOAD")).toBe(UPLOADED_NOT_STAMPED);
    expect(uploadStampNote(true, "TEMPLATE")).toBeNull();
    expect(uploadStampNote(false, "UPLOAD")).toBeNull();
    expect(uploadStampNote(null, "UPLOAD")).toBeNull();
  });
  it("the parts list and the print view carry it (source scan)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const list = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/documents/parts-list.tsx"), "utf8");
    const print = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/documents/print/page.tsx"), "utf8");
    const read = readFileSync(join(process.cwd(), "src/lib/tender-docs/read.ts"), "utf8");
    expect(list).toMatch(/uploadNote/);
    expect(print).toMatch(/p\.stampNote/);
    expect(read.match(/uploadStampNote\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("the documents card's Restricted fact (U6)", () => {
  it("is the exercise's answer while a draft, and what was frozen once frozen; unanswered is never 'No'", async () => {
    const { restrictionFact } = await import("./stamp");
    expect(restrictionFact({ frozen: false, snapshot: undefined, answer: true })).toBe("Yes");
    expect(restrictionFact({ frozen: false, snapshot: undefined, answer: false })).toBe("No");
    expect(restrictionFact({ frozen: false, snapshot: undefined, answer: null })).toBe("Not answered");
    // Frozen: a later change to the exercise's answer does not rewrite it.
    expect(restrictionFact({ frozen: true, snapshot: true, answer: false })).toBe("Yes");
    expect(restrictionFact({ frozen: true, snapshot: null, answer: true })).toBe("Not answered");
    expect(restrictionFact({ frozen: true, snapshot: undefined, answer: true })).toBe("Not recorded with these documents");
  });
});
