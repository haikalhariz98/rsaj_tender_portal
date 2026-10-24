import { describe, expect, it } from "vitest";

import { fieldsNamed } from "@/lib/templates/merge";

import { conditionFieldValues, conditionsFaults, conditionsSnapshot, conditionStamp, hasTableDocument, readConditionsSnapshot, statesWindow, tableDocumentFaults, type ConditionsInput } from "./conditions";
import { freezePack, tableDocumentManifest } from "./freeze";
import { frozenWindowFault } from "./tendering";
import type { PackPartFacts, TemplateFacts } from "./types";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

const template = (code: string, nameEn: string, bodyEn: string): TemplateFacts => ({ id: code, code, nameEn, formCode: "", revisionDate: null, bodyEn, bodyMs: null, primaryLanguage: null, bodyVersion: 1 });
const part = (x: Partial<PackPartFacts>): PackPartFacts => ({ partCode: "p", printedNumber: "1", sortOrder: 1, label: "Part", role: "OTHER", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: null, template: null, state: "READY", omittedReason: "", liveUploads: 0, ...x });

/// A small pack whose templates carry every field increment 2 asks for (a worked example).
const NOTICE = part({ partCode: "n", printedNumber: "1", label: "Notice", role: "INVITATION", inTableDocument: false, template: template("notice", "Notice", "{{organisation.name}} invites tenders for {{exercise.title}}.\n\nBidders must be registered with {{eligibility.registration}}, each registration active and valid {{eligibility.window}}.") });
const INSTRUCTIONS = part({ partCode: "i", printedNumber: "2", label: "Instructions", role: "INSTRUCTIONS", inTableDocument: false, template: template("itt", "Instructions", "The successful bidder shall obtain the regulator's {{permit.type}}.") });
const CONDITIONS = part({ partCode: "c", printedNumber: "3", label: "Conditions", role: "CONDITIONS", template: template("cond", "Conditions", "General conditions.\n\n{{clause:anti_corruption}}") });
const DRAWINGS = part({ partCode: "d", printedNumber: "10", label: "Drawings", role: "DRAWINGS", source: "UPLOAD", template: null, liveUploads: 1 });
const PARTS = [NOTICE, INSTRUCTIONS, CONDITIONS, DRAWINGS];

const INPUT: ConditionsInput = {
  today: "2026-10-01",
  eligibility: {
    requirements: [{ bodyCode: "reg", bodyLabel: "the Demo Companies Registry", bodyLabelMs: null, qualifierLabel: null, qualifiers: "", alternativeGroup: 1, sortOrder: 0 }],
    bodies: [{ code: "reg", labelEn: "the Demo Companies Registry", labelMs: null, qualifierLabelEn: null, retiredOn: null }],
  },
  restriction: { restricted: false, label: "Restricted to eligible bidders", stamp: { EN: "RESTRICTED", MS: null } },
  permit: { regulated: true, permitCode: "c", list: { name: "Permits", values: [{ code: "c", label: "Permit Type C", retired: false }] } },
  clauses: { clauses: [{ code: "anti_corruption", titleEn: "Anti-corruption clause", titleMs: null, bodyEn: "No gratification shall be offered.", bodyMs: null, bodyVersion: 1, mandatoryInAgreements: true, retiredOn: null }], overrides: [] },
  assurance: { required: true, confirmations: [{ kind: "NO_AMBIGUITY", personName: "Nur Aina", confirmedOn: "2026-09-30" }, { kind: "DRAWINGS_COORDINATED", personName: "Rajesh Kumar", confirmedOn: "2026-09-30" }] },
};

describe("the tender's conditions, judged together at submission", () => {
  it("a pack meeting every condition has nothing blocking (one warning: the uploaded drawings are not read)", () => {
    expect(conditionsFaults(PARTS, INPUT, "TENDER").filter((f) => f.level === "block")).toEqual([]);
  });
  it("each condition left unset blocks in its own words: eligibility, restriction, permit, clause, assurance", () => {
    const unset: ConditionsInput = {
      ...INPUT,
      eligibility: { ...INPUT.eligibility, requirements: [] },
      restriction: { ...INPUT.restriction, restricted: null },
      permit: { ...INPUT.permit, regulated: null },
      clauses: { ...INPUT.clauses, clauses: [{ ...INPUT.clauses.clauses[0], mandatoryInAgreements: null }] },
      assurance: { required: null, confirmations: [] },
    };
    expect(codes(conditionsFaults(PARTS, unset, "TENDER").filter((f) => f.level === "block"))).toEqual(["ELIGIBILITY_NOT_SET", "RESTRICTION_NOT_ANSWERED", "REGULATED_NOT_ANSWERED", "CLAUSE_MANDATORY_UNSET", "ASSURANCE_POLICY_NOT_SET"]);
  });
});

describe("FR-DOC-010 (the part built here): the Tender Table Document's parts", () => {
  it("every part not omitted says whether it is in it; unset is not 'no'", () => {
    expect(tableDocumentFaults(PARTS, "TENDER")).toEqual([]);
    expect(tableDocumentFaults([...PARTS, part({ partCode: "x", printedNumber: "8", label: "Form", inTableDocument: null })], "TENDER")).toEqual([{ code: "TABLE_DOCUMENT_UNSET", level: "block", data: { part: "8. Form" } }]);
    expect(tableDocumentFaults([part({ inTableDocument: null, state: "OMITTED", mandatory: false, omittedReason: "x" }), CONDITIONS], "TENDER")).toEqual([]);
    expect(codes(tableDocumentFaults([NOTICE, INSTRUCTIONS], "TENDER"))).toEqual(["TABLE_DOCUMENT_EMPTY"]);
  });
  it("only a tender pack must hold one: a quotation answered 'no' on every part has none, but an unset part still blocks (RSAJ answer 9)", () => {
    const no = PARTS.map((p) => ({ ...p, inTableDocument: false }));
    expect(tableDocumentFaults(no, "QUOTATION")).toEqual([]);
    expect(hasTableDocument(no)).toBe(false);
    expect(codes(tableDocumentFaults(no, "TENDER"))).toEqual(["TABLE_DOCUMENT_EMPTY"]);
    expect(tableDocumentFaults([...no, part({ partCode: "x", printedNumber: "8", label: "Form", inTableDocument: null })], "QUOTATION")).toEqual([{ code: "TABLE_DOCUMENT_UNSET", level: "block", data: { part: "8. Form" } }]);
    expect(hasTableDocument(PARTS)).toBe(true);
    expect(hasTableDocument([part({ inTableDocument: true, state: "OMITTED", mandatory: false, omittedReason: "x" })])).toBe(false);
  });
  it("the table document's manifest is the frozen parts in it, ready, in print order", () => {
    const { manifest } = freezePack({ parts: PARTS.map((p) => ({ ...p, files: [] })), fields: {}, bill: null, appendix: null });
    expect(tableDocumentManifest(manifest).map((m) => m.printedNumber)).toEqual(["3", "10"]);
    expect(tableDocumentManifest(null)).toEqual([]);
  });
});

describe("the worked notice: frozen with the proposed window, the permit, the clause", () => {
  const window = { startOn: "2026-10-12", closingDay: "2026-10-29" };
  it("renders every field and states the registrations over the window", () => {
    const by = conditionFieldValues(INPUT, window);
    const { documents } = freezePack({ parts: PARTS.map((p) => ({ ...p, files: [] })), fields: { "organisation.name": "Demo Water Utility", "exercise.title": "Filter works" }, fieldsByLanguage: by, whitelist: undefined, bill: null, appendix: null });
    // Without the clause whitelist the conditions part's citation is refused, never printed (fails safe).
    expect(documents.find((d) => d.partCode === "c")!.renderedText).toContain("[not a merge field]");
    expect(documents.find((d) => d.partCode === "n")!.renderedText).toBe(
      "Demo Water Utility invites tenders for Filter works.\n\nBidders must be registered with the Demo Companies Registry, each registration active and valid from 12 October 2026 to 29 October 2026.",
    );
    expect(documents.find((d) => d.partCode === "i")!.renderedText).toBe("The successful bidder shall obtain the regulator's Permit Type C.");
  });
  it("the snapshot keeps what it was judged under, in words, and the days the documents state", () => {
    const s = conditionsSnapshot(PARTS, INPUT, window);
    expect(s.eligibility.text).toBe("the Demo Companies Registry");
    expect(s.eligibility.window).toBe("from 12 October 2026 to 29 October 2026");
    expect(s.windowStated).toEqual(window);
    expect(s.permit).toEqual({ regulated: true, permit: "Permit Type C", list: "Permits" });
    expect(s.restriction).toEqual({ restricted: false, label: "Restricted to eligible bidders", stampEn: null, stampMs: null });
    expect(s.clauses).toEqual([{ title: "Anti-corruption clause", bodyVersion: 1, overriddenBy: null, overrideReason: null }]);
    expect(s.assurance.needed).toEqual(["NO_AMBIGUITY", "DRAWINGS_COORDINATED"]);
    expect(s.tableDocument).toEqual(["3. Conditions", "10. Drawings"]);
    expect(readConditionsSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(readConditionsSnapshot(null)).toBeNull();
    expect(readConditionsSnapshot({ judgedOn: "2026-10-01" })).toBeNull();
  });
  it("a pack whose templates do not state the window frees the approver's days", () => {
    expect(statesWindow(PARTS)).toBe(true);
    expect(statesWindow([INSTRUCTIONS, CONDITIONS])).toBe(false);
    expect(conditionsSnapshot([INSTRUCTIONS, CONDITIONS], INPUT, window).windowStated).toBeNull();
  });
  it("the stamp applies only to a restricted tender", () => {
    expect(conditionStamp(INPUT)).toBeNull();
    expect(conditionStamp({ ...INPUT, restriction: { ...INPUT.restriction, restricted: true } })).toEqual({ EN: "RESTRICTED", MS: null });
  });
});

describe("FR-DOC-005 with FR-DOC-012: the approving step records the days the frozen documents state", () => {
  const stated = { startOn: "2026-10-12", closingDay: "2026-10-29" };
  it("the same days pass; another day is refused (returned for amendment instead)", () => {
    expect(frozenWindowFault(stated, { startOn: "2026-10-12", closingDay: "2026-10-29" })).toBeNull();
    expect(frozenWindowFault(stated, { startOn: "2026-10-13", closingDay: "2026-10-29" })?.code).toBe("DATES_DIFFER_FROM_DOCUMENTS");
    expect(frozenWindowFault(stated, { startOn: "2026-10-12", closingDay: "2026-10-30" })?.code).toBe("DATES_DIFFER_FROM_DOCUMENTS");
  });
  it("where no frozen document states the window (or it was frozen before increment 2), any valid days", () => {
    expect(frozenWindowFault(null, { startOn: "2026-11-01", closingDay: "2026-11-20" })).toBeNull();
  });
});

describe("the merge fields a body names", () => {
  it("each once, in order, whitelisted or not", () => {
    expect(fieldsNamed("{{ a }} and {{b}} then {{a}} {{clause:x}}")).toEqual(["a", "b", "clause:x"]);
    expect(fieldsNamed(null)).toEqual([]);
  });
});
