import { describe, expect, it } from "vitest";

import { eligibilityEditFault, eligibilityFaults, eligibilityFieldValues, groupsOf, noticeFaults, registrationText, requirementFaults, validityWindowText, type RegistrationBodyFacts, type RequirementFacts } from "./eligibility";
import { renderWith } from "@/lib/templates/merge";
import { PACK_WHITELIST } from "./fields";
import type { PackPartFacts, TemplateFacts } from "./types";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

/**
 * SK001 7.3.4(a), as rewritten on 02.01.2026 (spec FR-DOC-005), as a test-only fixture: the
 * bodies are configuration in the product, never shipped. Lawful registration with the
 * companies registry; and valid construction-board registration with grade, category and
 * specialisation, or supplier-register registration with field codes, or the SPKK where
 * required.
 */
const body = (code: string, labelEn: string, qualifierLabelEn: string | null, x: Partial<RegistrationBodyFacts> = {}): RegistrationBodyFacts => ({ code, labelEn, labelMs: null, qualifierLabelEn, retiredOn: null, ...x });
const BODIES: RegistrationBodyFacts[] = [
  body("ssm", "the Companies Commission of Malaysia (SSM)", null, { labelMs: "Suruhanjaya Syarikat Malaysia (SSM)" }),
  body("cidb", "the Construction Industry Development Board (CIDB)", "Grade, category and specialisation"),
  body("mof", "the Ministry of Finance (MOF)", "Field codes", { labelMs: "Kementerian Kewangan (MOF)" }),
  body("spkk", "a valid SPKK", null),
  body("old", "A body since retired", null, { retiredOn: "2026-06-30" }),
];
const req = (bodyCode: string, alternativeGroup: number, qualifiers = "", sortOrder = 0): RequirementFacts => {
  const b = BODIES.find((x) => x.code === bodyCode)!;
  return { bodyCode, bodyLabel: b.labelEn, bodyLabelMs: b.labelMs, qualifierLabel: b.qualifierLabelEn, qualifiers, alternativeGroup, sortOrder };
};
const SK001: RequirementFacts[] = [req("ssm", 1), req("cidb", 2, "grade G4, category CE, specialisation CE21", 1), req("mof", 2, "field code 220101", 2), req("spkk", 2, "", 3)];
const TODAY = "2026-10-01";

describe("FR-DOC-005: the registrations a bidder must hold, from configured bodies", () => {
  it("the spec's eligibility code reads as groups: all required, alternatives within one", () => {
    expect(eligibilityFaults(SK001, BODIES, TODAY)).toEqual([]);
    expect(registrationText(SK001, "EN")).toBe(
      "the Companies Commission of Malaysia (SSM); and the Construction Industry Development Board (CIDB) (grade G4, category CE, specialisation CE21) or the Ministry of Finance (MOF) (field code 220101) or a valid SPKK",
    );
    // A Malay document names a body by its Malay name where it has one, and joins in Malay.
    expect(registrationText(SK001, "MS")).toBe(
      "Suruhanjaya Syarikat Malaysia (SSM); dan the Construction Industry Development Board (CIDB) (grade G4, category CE, specialisation CE21) atau Kementerian Kewangan (MOF) (field code 220101) atau a valid SPKK",
    );
  });
  it("groups print in order, each's alternatives by their order, whatever order they were entered in", () => {
    const shuffled = [SK001[3], SK001[1], SK001[0], SK001[2]];
    expect(registrationText(shuffled, "EN")).toBe(registrationText(SK001, "EN"));
    expect(groupsOf(shuffled).map((g) => g.map((r) => r.bodyCode))).toEqual([["ssm"], ["cidb", "mof", "spkk"]]);
  });
  it("no requirement is not 'anyone may bid': it blocks", () => {
    expect(codes(eligibilityFaults([], BODIES, TODAY))).toEqual(["ELIGIBILITY_NOT_SET"]);
  });
  it("a body that takes qualifiers needs them; one that takes none refuses them", () => {
    expect(codes(requirementFaults({ bodyCode: "cidb", qualifiers: " ", alternativeGroup: 1 }, BODIES, TODAY))).toEqual(["QUALIFIERS_REQUIRED"]);
    expect(codes(requirementFaults({ bodyCode: "ssm", qualifiers: "grade G7", alternativeGroup: 1 }, BODIES, TODAY))).toEqual(["QUALIFIERS_NOT_TAKEN"]);
    expect(requirementFaults({ bodyCode: "cidb", qualifiers: "G4", alternativeGroup: 1 }, BODIES, TODAY)).toEqual([]);
  });
  it("only a configured, live body; a group is a whole number from 1", () => {
    expect(codes(requirementFaults({ bodyCode: "nowhere", qualifiers: "", alternativeGroup: 1 }, BODIES, TODAY))).toEqual(["BODY_NOT_CONFIGURED"]);
    expect(codes(requirementFaults({ bodyCode: "old", qualifiers: "", alternativeGroup: 1 }, BODIES, TODAY))).toEqual(["BODY_RETIRED"]);
    // Retired from a later day: still live today.
    expect(requirementFaults({ bodyCode: "old", qualifiers: "", alternativeGroup: 1 }, BODIES, "2026-06-29")).toEqual([]);
    expect(codes(requirementFaults({ bodyCode: "ssm", qualifiers: "", alternativeGroup: 0 }, BODIES, TODAY))).toEqual(["GROUP_NOT_VALID"]);
    expect(codes(requirementFaults({ bodyCode: "ssm", qualifiers: "", alternativeGroup: 1.5 }, BODIES, TODAY))).toEqual(["GROUP_NOT_VALID"]);
  });
  it("a body removed from configuration since is named as the exercise recorded it; a body twice in a group blocks", () => {
    const gone = { ...req("ssm", 1), bodyCode: "gone", bodyLabel: "A registry once configured" };
    expect(eligibilityFaults([gone], BODIES, TODAY)).toEqual([{ code: "BODY_NOT_CONFIGURED", level: "block", data: { body: "A registry once configured" } }]);
    expect(codes(eligibilityFaults([req("ssm", 1), req("ssm", 1)], BODIES, TODAY))).toEqual(["BODY_TWICE_IN_GROUP"]);
    expect(eligibilityFaults([req("ssm", 1), req("ssm", 2)], BODIES, TODAY)).toEqual([]);
  });
});

describe("FR-DOC-005: the validity window is a date range, from the start to the closing day", () => {
  it("states both days, in the document's language", () => {
    expect(validityWindowText("2026-10-12", "2026-10-29", "EN")).toBe("from 12 October 2026 to 29 October 2026");
    expect(validityWindowText("2026-10-12", "2026-10-29", "MS")).toBe("dari 12 Oktober 2026 hingga 29 Oktober 2026");
  });
  it("before the dates are proposed the window is empty, so a notice rendered live reports it not recorded", () => {
    const v = eligibilityFieldValues(SK001, null, "EN");
    expect(v["eligibility.window"]).toBe("");
    const r = renderWith("Valid {{eligibility.window}}.", v, PACK_WHITELIST);
    expect(r.missing).toEqual(["eligibility.window"]);
    expect(r.paragraphs[0]).toBe("Valid [validity window not recorded].");
  });
  it("a notice rendered with the proposed days states the registrations and the range", () => {
    const v = eligibilityFieldValues(SK001, { startOn: "2026-10-12", closingDay: "2026-10-29" }, "EN");
    const r = renderWith("Bidders must be registered with {{eligibility.registration}}, each registration active and valid {{eligibility.window}}.", v, PACK_WHITELIST);
    expect(r.missing).toEqual([]);
    expect(r.paragraphs[0]).toContain("valid from 12 October 2026 to 29 October 2026.");
    expect(r.paragraphs[0]).toContain("or a valid SPKK");
  });
});

const template = (x: Partial<TemplateFacts> = {}): TemplateFacts => ({ id: "t1", code: "notice", nameEn: "Notice", formCode: "", revisionDate: null, bodyEn: "Registered with {{eligibility.registration}}, valid {{eligibility.window}}.", bodyMs: null, primaryLanguage: null, bodyVersion: 1, ...x });
const notice = (x: Partial<PackPartFacts> = {}): PackPartFacts => ({ partCode: "n", printedNumber: "1", sortOrder: 1, label: "Notice", role: "INVITATION", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: false, templateCode: "notice", template: template(), state: "READY", omittedReason: "", liveUploads: 0, ...x });

describe("FR-DOC-005: the notice cannot go without the eligibility block", () => {
  it("a template notice naming both fields passes", () => {
    expect(noticeFaults([notice()])).toEqual([]);
  });
  it("no notice part, or the only one omitted, blocks", () => {
    expect(codes(noticeFaults([]))).toEqual(["NOTICE_PART_MISSING"]);
    expect(codes(noticeFaults([notice({ state: "OMITTED", mandatory: false, omittedReason: "x" })]))).toEqual(["NOTICE_PART_MISSING"]);
  });
  it("a template missing a field in its English text blocks, naming the field", () => {
    expect(noticeFaults([notice({ template: template({ bodyEn: "Registered with {{eligibility.registration}}." }) })])).toEqual([
      { code: "NOTICE_LACKS_ELIGIBILITY", level: "block", data: { part: "1. Notice", template: "Notice", fields: "{{eligibility.window}}" } },
    ]);
    // Founder, 2026-10-20: English only. A Malay text lacking the field was judged too; it is not issued now, so a good English text beside one lacking it passes.
    expect(noticeFaults([notice({ template: template({ bodyMs: "Berdaftar dengan {{eligibility.registration}}.", primaryLanguage: "MS" }) })])).toEqual([]);
  });
  it("an uploaded notice is not read: a warning that it is unchecked, never a pass", () => {
    expect(noticeFaults([notice({ source: "UPLOAD", template: null, liveUploads: 1 })])).toEqual([{ code: "NOTICE_NOT_CHECKED", level: "warn", data: { part: "1. Notice" } }]);
  });
});

describe("the conditions change only before the documents go for approval", () => {
  it("a draft or an exercise in preparation; never once submitted or approved", () => {
    expect(eligibilityEditFault("DRAFT")).toBeNull();
    expect(eligibilityEditFault("DOCUMENTS_IN_PREPARATION")).toBeNull();
    expect(eligibilityEditFault("PENDING_APPROVAL_FOR_TENDERING")?.code).toBe("CONDITIONS_FROZEN");
    expect(eligibilityEditFault("APPROVED_FOR_TENDERING")?.code).toBe("CONDITIONS_FROZEN");
    expect(eligibilityEditFault("CANCELLED")?.code).toBe("CONDITIONS_FROZEN");
  });
});
