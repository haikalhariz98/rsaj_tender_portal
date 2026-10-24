import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import { behaviourProfile } from "@/lib/method/profile";
import type { ContractBehaviours } from "@/lib/method/types";
import type { PackFault, PackInput } from "@/lib/scope/pack";
import type { BqLine } from "@/lib/scope/types";

import type { AppendixFacts } from "./appendix";
import { resolveComposition } from "./composition";
import { appendixText, freezePack, packManifest, unpricedBqText } from "./freeze";
import type { ConditionsInput } from "./conditions";
// SR-11 (ruling 14): there is no Mark ready and no Omit, so `markReadyFaults` is `partReadyFaults` (the content check a line's note and the gate share) and `omitFaults` is gone;
// a part is ready when its content is in order (`partIssue`) and an optional one with nothing to issue is "Not issued".
import { allOf, blockingOf, issuedPart, mayHoldFile, nextPack, NOT_ISSUED_REASON, packEditFault, packReadiness, partIssue, partReadyFaults, pickTemplateFaults, settledPart, startPackFaults, submitFaults, takesFile, templateFaults, type SubmitInput } from "./pack";
import { OMP005_QUOTATION_PARTS, SK001_TENDER_PARTS } from "./sk001-fixture";
import type { PackPartFacts, TemplateFacts } from "./types";

const sen = parseSen;
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

const template = (x: Partial<TemplateFacts> = {}): TemplateFacts => ({ id: "tpl1", code: "form_of_tender", nameEn: "Form of tender", formCode: "F-1", revisionDate: "2026-01-01", bodyEn: "Tender for {{exercise.title}} ({{exercise.reference}}).", bodyMs: null, primaryLanguage: null, bodyVersion: 3, ...x });
const part = (x: Partial<PackPartFacts> = {}): PackPartFacts => ({
  partCode: "p2", printedNumber: "2", sortOrder: 20, label: "Form of tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, returnedByBidder: true, templateCode: "form_of_tender", template: template(), state: "READY", omittedReason: "", liveUploads: 0, ...x,
});
const declaration = part({ partCode: "p9", printedNumber: "9", label: "Declaration", role: "DECLARATION", template: template({ id: "tpl9", code: "declaration", nameEn: "Declaration", bodyEn: "I declare." }) });
// SR-09: the bill is on screen in these cases, as every exercise before the switch was.
const CTX = { bqFinalised: true, billOnScreen: true, appendixComplete: true };
/// Increment 2 (faithful fixture update): a notice carrying the eligibility block (FR-DOC-005),
/// and conditions every check passes with no finding at all.
const notice = part({ partCode: "p1", printedNumber: "1", label: "Notice", role: "INVITATION", template: template({ id: "tpl1n", code: "notice", nameEn: "Notice", bodyEn: "Registered with {{eligibility.registration}}, valid {{eligibility.window}}." }) });
const CLEAR_CONDITIONS: ConditionsInput = {
  today: "2026-10-01",
  eligibility: { requirements: [{ bodyCode: "reg", bodyLabel: "A registry", bodyLabelMs: null, qualifierLabel: null, qualifiers: "", alternativeGroup: 1, sortOrder: 0 }], bodies: [{ code: "reg", labelEn: "A registry", labelMs: null, qualifierLabelEn: null, retiredOn: null }] },
  restriction: { restricted: false, label: null, stamp: { EN: null, MS: null } },
  permit: { regulated: false, permitCode: null, list: null },
  clauses: { clauses: [], overrides: [] },
  assurance: { required: true, confirmations: [{ kind: "NO_AMBIGUITY", personName: "A officer", confirmedOn: "2026-09-30" }] },
};

describe("a part's content, by its source (FR-DOC-003)", () => {
  it("a template part needs its template, with English text, and only pack merge fields", () => {
    expect(codes(partReadyFaults(part({ state: "NOT_STARTED", template: null }), "DRAFT", "DOCUMENTS_IN_PREPARATION", CTX))).toEqual(["TEMPLATE_NOT_SET"]);
    expect(codes(templateFaults(template({ bodyEn: " ", bodyMs: null })))).toEqual(["TEMPLATE_BODY_EMPTY"]);
    // Founder, 2026-10-20: English only. Two texts and no first language used to block; the English one is issued, and a Malay-only template has no text.
    expect(templateFaults(template({ bodyMs: "Tawaran.", primaryLanguage: null }))).toEqual([]);
    expect(codes(templateFaults(template({ bodyEn: null, bodyMs: "Tawaran.", primaryLanguage: "MS" })))).toEqual(["TEMPLATE_BODY_EMPTY"]);
    expect(templateFaults(template({ bodyEn: "Awarded to {{awardee.name}}." }))).toEqual([{ code: "TEMPLATE_UNKNOWN_FIELD", level: "block", data: { template: "Form of tender", fields: "{{awardee.name}}" } }]);
    expect(partReadyFaults(part({ state: "NOT_STARTED" }), "DRAFT", "DOCUMENTS_IN_PREPARATION", CTX)).toEqual([]);
  });
  it("a bespoke part is never drawn from the library", () => {
    expect(codes(partReadyFaults(part({ state: "NOT_STARTED", content: "BESPOKE" }), "DRAFT", "DOCUMENTS_IN_PREPARATION", CTX))).toEqual(["BESPOKE_FROM_LIBRARY"]);
    expect(codes(pickTemplateFaults(part({ content: "BESPOKE" }), template(), "DRAFT", "DOCUMENTS_IN_PREPARATION"))).toEqual(["BESPOKE_FROM_LIBRARY"]);
    expect(codes(pickTemplateFaults(part({ source: "UPLOAD" }), template(), "DRAFT", "DOCUMENTS_IN_PREPARATION"))).toEqual(["NOT_A_TEMPLATE_PART"]);
  });
  it("the bill part needs a finalised bill; the Appendix part a complete Appendix; an uploaded part its file", () => {
    expect(codes(partReadyFaults(part({ state: "NOT_STARTED", source: "BQ_UNPRICED", content: "BESPOKE", template: null }), "DRAFT", "DOCUMENTS_IN_PREPARATION", { ...CTX, bqFinalised: false }))).toEqual(["BQ_PART_WITHOUT_BQ"]);
    expect(codes(partReadyFaults(part({ state: "NOT_STARTED", source: "APPENDIX", content: "BESPOKE", template: null }), "DRAFT", "DOCUMENTS_IN_PREPARATION", { ...CTX, appendixComplete: false }))).toEqual(["APPENDIX_INCOMPLETE"]);
    expect(codes(partReadyFaults(part({ state: "NOT_STARTED", source: "UPLOAD", content: "BESPOKE", template: null, liveUploads: 0 }), "DRAFT", "DOCUMENTS_IN_PREPARATION", CTX))).toEqual(["UPLOAD_MISSING"]);
    expect(partReadyFaults(part({ state: "NOT_STARTED", source: "UPLOAD", content: "BESPOKE", template: null, liveUploads: 1 }), "DRAFT", "DOCUMENTS_IN_PREPARATION", CTX)).toEqual([]);
  });
  it("only a draft pack on an exercise in preparation changes", () => {
    expect(packEditFault("SUBMITTED", "PENDING_APPROVAL_FOR_TENDERING")?.code).toBe("EXERCISE_NOT_IN_PREPARATION");
    expect(packEditFault("RETURNED", "DOCUMENTS_IN_PREPARATION")?.code).toBe("PACK_NOT_DRAFT");
    expect(codes(partReadyFaults(part({ state: "NOT_STARTED" }), "SUBMITTED", "PENDING_APPROVAL_FOR_TENDERING", CTX))).toEqual(["EXERCISE_NOT_IN_PREPARATION"]);
  });
});

describe("a part that has nothing to issue (SR-11, ruling 14: no Omit, \"Not issued\" instead)", () => {
  it("an optional part with nothing to issue is recorded Not issued; a mandatory one is not ready; a mandatory flag that is not set is not an excuse", () => {
    const empty = { source: "UPLOAD" as const, content: "BESPOKE" as const, template: null, liveUploads: 0 };
    expect(partIssue(part({ ...empty, mandatory: false }), CTX)).toMatchObject({ state: "NOT_ISSUED" });
    expect(partIssue(part({ ...empty, mandatory: true }), CTX)).toMatchObject({ state: "NOT_READY" });
    expect(partIssue(part({ ...empty, mandatory: null }), CTX)).toMatchObject({ state: "NOT_READY" });
    expect(settledPart(part({ ...empty, mandatory: false }), CTX)).toMatchObject({ state: "OMITTED", omittedReason: NOT_ISSUED_REASON });
    expect(NOT_ISSUED_REASON).toBe("Not issued");
  });
  it("is settled from the content, not from a stored state: what an officer once marked is judged again", () => {
    expect(settledPart(part({ state: "NOT_STARTED" }), CTX)).toMatchObject({ state: "READY", omittedReason: "" });
    expect(settledPart(part({ state: "OMITTED", omittedReason: "old", mandatory: true }), CTX)).toMatchObject({ state: "READY", omittedReason: "" });
    expect(settledPart(part({ state: "READY", template: null }), CTX)).toMatchObject({ state: "NOT_STARTED" });
  });
});

describe("a part is ready on its content, by its source (SR-11, SR-09, ADR 0035)", () => {
  const upload = (x: Partial<PackPartFacts> = {}) => part({ source: "UPLOAD", content: "BESPOKE", template: null, liveUploads: 0, ...x });
  it("an uploaded part is ready on its first live file", () => {
    expect(partIssue(upload(), CTX).state).toBe("NOT_READY");
    expect(partIssue(upload({ liveUploads: 1 }), CTX)).toEqual({ state: "READY", as: "FILE" });
  });
  it("a merged-text part is ready when its merge has no missing field, and a file uploaded to it replaces the merged text as the issued part", () => {
    expect(partIssue(part(), CTX)).toEqual({ state: "READY", as: "TEXT" });
    // The merge is not judged once a file stands in its place: even a template that would not merge.
    const broken = part({ template: template({ bodyEn: "Awarded to {{awardee.name}}." }), liveUploads: 1 });
    expect(codes(partReadyFaults(broken, "DRAFT", "DOCUMENTS_IN_PREPARATION", CTX))).toEqual([]);
    expect(partIssue(broken, CTX)).toEqual({ state: "READY", as: "FILE" });
    expect(codes(partReadyFaults({ ...broken, liveUploads: 0 }, "DRAFT", "DOCUMENTS_IN_PREPARATION", CTX))).toEqual(["TEMPLATE_UNKNOWN_FIELD"]);
  });
  it("the bill part is the on-screen bill when the exercise builds one, and an uploaded file when it does not (SR-09)", () => {
    const bill = part({ source: "BQ_UNPRICED", content: "BESPOKE", template: null });
    expect(codes(partReadyFaults(bill, "DRAFT", "DOCUMENTS_IN_PREPARATION", { ...CTX, bqFinalised: false }))).toEqual(["BQ_PART_WITHOUT_BQ"]);
    expect(partIssue(bill, CTX)).toEqual({ state: "READY", as: "BILL" });
    // Off: a finalised bill earlier on the exercise is not what is issued; the file is.
    const off = { ...CTX, billOnScreen: false };
    expect(partReadyFaults(bill, "DRAFT", "DOCUMENTS_IN_PREPARATION", off)).toEqual([{ code: "UPLOAD_MISSING", level: "block", data: { part: "2. Form of tender", bill: 1 } }]);
    expect(partIssue({ ...bill, liveUploads: 1 }, off)).toEqual({ state: "READY", as: "FILE" });
    expect(takesFile(bill, off)).toBe(true);
    expect(takesFile(bill, CTX)).toBe(false);
  });
  it("a file may be held by an uploaded part, a merged-text part and the bill where it is a file; never by the Appendix or the on-screen bill", () => {
    const off = { billOnScreen: false };
    expect(mayHoldFile({ source: "UPLOAD" }, CTX)).toBe(true);
    expect(mayHoldFile({ source: "TEMPLATE" }, CTX)).toBe(true);
    expect(mayHoldFile({ source: "APPENDIX" }, off)).toBe(false);
    expect(mayHoldFile({ source: "BQ_UNPRICED" }, CTX)).toBe(false);
    expect(mayHoldFile({ source: "BQ_UNPRICED" }, off)).toBe(true);
    // Not set: the bill part holds nothing until the pin is set.
    expect(mayHoldFile({ source: "BQ_UNPRICED" }, { billOnScreen: null })).toBe(false);
  });
  it("a merged-text part with a file is read by the checks as an uploaded part: its template words are not what is issued", () => {
    const p = issuedPart(part({ liveUploads: 1 }), CTX);
    expect(p).toMatchObject({ source: "UPLOAD", template: null, state: "READY" });
    expect(issuedPart(part(), CTX)).toMatchObject({ source: "TEMPLATE", state: "READY" });
    expect(issuedPart(part({ source: "BQ_UNPRICED", content: "BESPOKE", template: null, liveUploads: 1 }), { ...CTX, billOnScreen: false })).toMatchObject({ source: "UPLOAD", state: "READY" });
  });
});

describe("the pack's readiness (FR-DOC-001, 008)", () => {
  it("every part ready, or omitted with a reason where not mandatory, and the declaration bound in", () => {
    expect(packReadiness([part(), declaration], CTX)).toEqual([]);
    // SR-11: the stored state is not read. A part with its content in order is ready whatever it was marked; one without says what it lacks (it was PART_NOT_READY).
    expect(packReadiness([part({ state: "NOT_STARTED" }), declaration], CTX)).toEqual([]);
    expect(codes(packReadiness([part({ state: "READY", template: null }), declaration], CTX))).toEqual(["TEMPLATE_NOT_SET"]);
    // An optional part with nothing to issue is Not issued, which does not block (it was OMIT_REASON_REQUIRED without a reason).
    expect(packReadiness([part({ state: "OMITTED", mandatory: false, omittedReason: "", template: null }), declaration], CTX)).toEqual([]);
    expect(codes(packReadiness([part({ mandatory: null }), declaration], CTX))).toEqual(["MANDATORY_UNSET"]);
  });
  it("a ready part whose content has since gone is not ready", () => {
    expect(codes(packReadiness([part({ source: "UPLOAD", content: "BESPOKE", template: null, liveUploads: 0 }), declaration], CTX))).toEqual(["UPLOAD_MISSING"]);
  });
  it("no declaration part, or one not mandatory, blocks (FR-DOC-008)", () => {
    expect(codes(packReadiness([part()], CTX))).toEqual(["DECLARATION_PART_MISSING"]);
    expect(codes(packReadiness([part(), { ...declaration, mandatory: false }], CTX))).toEqual(["DECLARATION_NOT_MANDATORY"]);
  });
  it("OM/P/005's nine quotation parts bind no declaration, so a pack on them blocks until the customer adds one", () => {
    const c = resolveComposition(OMP005_QUOTATION_PARTS, "QUOTATION", "bq", "2026-10-01");
    if ("fault" in c) throw new Error(c.fault);
    const parts = c.parts.map((p) => part({ partCode: p.code, printedNumber: p.printedNumber, label: p.labelEn, role: p.role, mandatory: p.mandatory, state: "READY" }));
    expect(codes(packReadiness(parts, CTX))).toContain("DECLARATION_PART_MISSING");
  });
  it("no parts at all is not a pack", () => {
    expect(codes(packReadiness([], CTX))).toEqual(["NO_PARTS"]);
  });
});

describe("starting a pack", () => {
  const composition = resolveComposition(SK001_TENDER_PARTS, "TENDER", "bq", "2026-10-01");
  const ok = { exerciseStatus: "DOCUMENTS_IN_PREPARATION" as const, packKindSnapshot: "TENDER" as const, packs: [], composition };
  it("starts on an exercise in preparation with a recorded pack kind and a composition", () => {
    expect(startPackFaults(ok)).toEqual([]);
  });
  it("refuses, saying why: not in preparation, prepared before assembly, no pack, one live or approved, nothing configured", () => {
    expect(codes(startPackFaults({ ...ok, exerciseStatus: "DRAFT" }))).toEqual(["EXERCISE_NOT_IN_PREPARATION"]);
    expect(codes(startPackFaults({ ...ok, packKindSnapshot: null }))).toEqual(["PREPARED_BEFORE_ASSEMBLY"]);
    expect(codes(startPackFaults({ ...ok, packKindSnapshot: "NONE" }))).toEqual(["NO_PACK_FOR_METHOD"]);
    expect(codes(startPackFaults({ ...ok, packs: [{ status: "DRAFT" }] }))).toEqual(["LIVE_PACK_EXISTS"]);
    expect(codes(startPackFaults({ ...ok, packs: [{ status: "SUBMITTED" }] }))).toEqual(["LIVE_PACK_EXISTS"]);
    expect(codes(startPackFaults({ ...ok, packs: [{ status: "RETURNED" }, { status: "APPROVED" }] }))).toEqual(["PACK_APPROVED"]);
    expect(codes(startPackFaults({ ...ok, composition: resolveComposition([], "TENDER", "bq", "2026-10-01") }))).toEqual(["COMPOSITION_NOT_SET"]);
  });
  it("after a return, the next version continues the returned one", () => {
    expect(nextPack([])).toEqual({ versionNo: 1, copyFrom: null });
    const returned = { id: "a", versionNo: 1, status: "RETURNED" as const };
    expect(nextPack([returned])).toEqual({ versionNo: 2, copyFrom: returned });
    expect(nextPack([returned, { id: "b", versionNo: 2, status: "VOID" as const }])).toEqual({ versionNo: 3, copyFrom: null });
  });
});

// ------------------------------------------------------------------ submission

const works: ContractBehaviours = {
  pricingBasis: "Lump sum", registrationTest: "Registered for the grade", administratorRoleCodes: [], startRequiresSecurities: false, eotInstrument: null, completionInstrument: null,
  defectsLiabilityApplies: false, makingGoodCertificate: null, nominationAllowed: true, interimPaymentRule: "Monthly", sumAdjustmentDrivers: [], claimsApprovalCommitteeCode: null,
};
const cleanScope: PackInput = {
  basis: { requiresBq: true },
  method: { requiresCompanyEstimate: true },
  bq: [{ status: "FINALISED", versionNo: 1 }],
  // SR-08, SR-09 (G1): an exercise that uses both, as every exercise before the pins did.
  specPanelUsed: true,
  onScreenBillUsed: true,
  panel: "VERIFIED",
  panelBill: { versionNo: 1, status: "FINALISED" },
  estimate: { state: "LODGED", behind: false },
  scope: "NOT_REQUIRED",
};
const submit = (x: Partial<SubmitInput> = {}): SubmitInput => ({
  packStatus: "DRAFT",
  exerciseStatus: "DOCUMENTS_IN_PREPARATION",
  parts: [part(), declaration, notice],
  content: CTX,
  scope: cleanScope,
  appendix: null,
  profile: behaviourProfile(works),
  primeCostSums: 0n,
  dates: [],
  // SR-06, SR-07 (rulings 9 and 11): the notice and the opening officers join the gate; a clean submission has none outstanding.
  officers: [],
  notice: [],
  route: { issue: true, state: "RESOLVED", refusal: null, errors: [] },
  routeOpen: false,
  conditions: CLEAR_CONDITIONS,
  packKind: "TENDER",
  ...x,
});

describe("test 8: submission refuses on each of 6.2's scope findings (OD-4), read on locked rows", () => {
  it("a clean pack has nothing blocking", () => {
    expect(blockingOf(submitFaults(submit()))).toEqual([]);
  });
  const cases: [PackFault, Partial<PackInput>][] = [
    ["BASIS_NOT_CHOSEN", { basis: null }],
    ["BASIS_BQ_NOT_SET", { basis: { requiresBq: null } }],
    ["BQ_NOT_FINALISED", { bq: [{ status: "DRAFT", versionNo: 1 }], panelBill: null }],
    ["PANEL_NOT_VERIFIED", { panel: "DRAFT" }],
    ["PANEL_SCAN_GONE", { panel: "SCAN_GONE" }],
    ["PANEL_BILL_SUPERSEDED", { bq: [{ status: "SUPERSEDED", versionNo: 1 }, { status: "FINALISED", versionNo: 2 }], panelBill: { versionNo: 1, status: "SUPERSEDED" } }],
    ["METHOD_NOT_CONFIGURED", { method: null, scope: "METHOD_NOT_CONFIGURED" }],
    ["ESTIMATE_RULE_NOT_SET", { method: { requiresCompanyEstimate: null } }],
    ["ESTIMATE_NOT_LODGED", { estimate: null }],
    ["ESTIMATE_BEHIND", { estimate: { state: "LODGED", behind: true } }],
    ["SCOPE_RULE_NOT_SET", { scope: "RULE_NOT_SET" }],
    ["SCOPE_COMMITTEE_NOT_SET", { scope: "COMMITTEE_NOT_SET" }],
    ["SCOPE_ACT_NOT_SET", { scope: "ACT_NOT_SET" }],
    ["SCOPE_NOT_APPROVED", { scope: "NOT_TABLED" }],
  ];
  it.each(cases)("%s refuses it", (code, scope) => {
    const s = submitFaults(submit({ scope: { ...cleanScope, ...scope } }));
    expect(codes(s.scope)).toContain(code);
    expect(blockingOf(s).length).toBeGreaterThan(0);
  });
  it("an open revision of the bill only warns", () => {
    const s = submitFaults(submit({ scope: { ...cleanScope, bq: [{ status: "FINALISED", versionNo: 1 }, { status: "DRAFT", versionNo: 2 }] } }));
    expect(codes(s.scope)).toEqual(["BQ_REVISION_OPEN"]);
    expect(blockingOf(s)).toEqual([]);
  });
});

describe("submission's other checks", () => {
  const appendixPart = part({ partCode: "p3a", printedNumber: "3a", label: "Appendix", role: "APPENDIX", source: "APPENDIX", content: "BESPOKE", template: null });
  it("a pack with an Appendix part needs the Appendix, complete (FR-DOC-004)", () => {
    expect(codes(submitFaults(submit({ parts: [part(), appendixPart, declaration] })).appendix)).toEqual(["APPENDIX_NOT_STARTED"]);
  });
  it("the contract type's behaviours bind it (FR-MTD-012)", () => {
    expect(codes(submitFaults(submit({ profile: null })).behaviour)).toEqual(["PROFILE_NOT_RECORDED"]);
  });
  it("the route must resolve, from the matrix, and none may already be open", () => {
    expect(codes(submitFaults(submit({ route: { issue: false, state: null, refusal: null, errors: [] } })).route)).toEqual(["NO_ISSUE_IN_FORCE"]);
    expect(codes(submitFaults(submit({ route: { issue: true, state: "NO_RULE", refusal: null, errors: [] } })).route)).toEqual(["ROUTE_NO_RULE"]);
    expect(codes(submitFaults(submit({ route: { issue: true, state: "RESOLVED", refusal: "The requester…", errors: [] } })).route)).toEqual(["ROUTE_REFUSED"]);
    expect(codes(submitFaults(submit({ routeOpen: true })).route)).toEqual(["ROUTE_OPEN"]);
    // The engine's own error for a matter with no rule is not said twice.
    expect(codes(submitFaults(submit({ route: { issue: true, state: "NO_RULE", refusal: null, errors: ["No approval rule matches this matter."] } })).route)).toEqual(["ROUTE_NO_RULE"]);
    expect(codes(submitFaults(submit({ route: { issue: true, state: "RESOLVED", refusal: null, errors: ["The rule is a known gap."] } })).route)).toEqual(["ROUTE_ERROR"]);
  });
  it("the proposed dates' findings are carried", () => {
    expect(codes(allOf(submitFaults(submit({ dates: [{ code: "DATES_REQUIRED", level: "block" }] }))))).toEqual(["DATES_REQUIRED"]);
  });
  it("SR-06, SR-07: the notice and the opening officers are carried, each in its own family", () => {
    const f = submitFaults(submit({ officers: [{ code: "OFFICERS_SHORT", level: "block" }], notice: [{ code: "FEE_NOT_SET", level: "block" }] }));
    expect(codes(f.officers)).toEqual(["OFFICERS_SHORT"]);
    expect(codes(f.notice)).toEqual(["FEE_NOT_SET"]);
    expect(codes(blockingOf(f))).toEqual(["OFFICERS_SHORT", "FEE_NOT_SET"]);
  });
  it("increment 2: the tender's conditions bind it (FR-DOC-005, 006, 009, 011, 014)", () => {
    expect(codes(submitFaults(submit({ parts: [part(), declaration] })).conditions)).toEqual(["NOTICE_PART_MISSING"]);
    expect(codes(submitFaults(submit({ conditions: { ...CLEAR_CONDITIONS, restriction: { ...CLEAR_CONDITIONS.restriction, restricted: null } } })).conditions)).toEqual(["RESTRICTION_NOT_ANSWERED"]);
    expect(codes(blockingOf(submitFaults(submit({ conditions: { ...CLEAR_CONDITIONS, assurance: { required: null, confirmations: [] } } }))))).toEqual(["ASSURANCE_POLICY_NOT_SET"]);
  });
  it("a pack already with approval cannot be submitted again", () => {
    expect(codes(submitFaults(submit({ packStatus: "SUBMITTED", exerciseStatus: "PENDING_APPROVAL_FOR_TENDERING" })).edit)).toEqual(["EXERCISE_NOT_IN_PREPARATION"]);
  });
});

// ------------------------------------------------------------------ freezing

/** 6.2's worked bill (test fixture, RSAJ figures — X-10 d): total RM317,973.70, pipe laying at RM182.40. */
const workedBill = {
  versionNo: 2,
  sections: [
    {
      number: "1",
      title: "Pipework",
      items: [
        { itemRef: "A", description: "Preliminaries", unit: "item", kind: "MEASURED", quantity: "1", rate: sen("45000.00"), provisional: false },
        { itemRef: "B", description: "Pipe laying", unit: "m", kind: "MEASURED", quantity: "1250.5", rate: sen("182.40"), provisional: false },
        { itemRef: "C", description: "Excavation under road", unit: "m3", kind: "MEASURED", quantity: "310", rate: sen("65.75"), provisional: true },
        { itemRef: "D", description: "Prime cost sum", unit: "sum", kind: "PRIME_COST_SUM", quantity: "1", rate: sen("18000.00"), provisional: false },
        { itemRef: "E", description: "Provisional sum", unit: "sum", kind: "PROVISIONAL_SUM", quantity: "1", rate: sen("6500.00"), provisional: false },
      ] as BqLine[],
    },
  ],
  totals: { total: "317973.70" },
};

describe("test 7: the bill goes out unpriced (6.2 OD-8)", () => {
  it("the frozen bill part holds neither a rate (182.40) nor the total (317,973.70)", () => {
    const bqPart = part({ partCode: "p7a", printedNumber: "7a", label: "Bills of quantities", role: "BILL_OF_QUANTITIES", source: "BQ_UNPRICED", content: "BESPOKE", template: null });
    const { documents, manifest } = freezePack({ parts: [{ ...bqPart, files: [] }], fields: {}, bill: { versionId: "bqv2", frozen: workedBill }, appendix: null });
    expect(documents).toHaveLength(1);
    const everything = JSON.stringify(documents[0]) + documents[0].renderedText;
    for (const figure of ["182.40", "182.4", "18240", "317,973.70", "317973.70", "31797370", "45,000", "45000", "65.75"]) expect(everything).not.toContain(figure);
    expect(documents[0].renderedText).toContain("Pipe laying: 1250.5 m");
    expect(manifest[0].bill).toEqual({ versionId: "bqv2", versionNo: 2 });
    expect(unpricedBqText(workedBill)).not.toMatch(/RM/);
  });
});

describe("freezing renders each template part from its body version and pins every source", () => {
  it("renders the pack's fields, records the body version, pins uploads, and keeps an omission's reason", () => {
    const upload = part({ partCode: "p10", printedNumber: "10", label: "Drawings", role: "DRAWINGS", source: "UPLOAD", content: "BESPOKE", template: null, liveUploads: 1 });
    const omitted = part({ partCode: "p11", printedNumber: "11", label: "Corrigendum", role: "OTHER", source: "UPLOAD", content: "BESPOKE", template: null, mandatory: false, state: "OMITTED", omittedReason: "None issued" });
    const file = { versionId: "v1", documentId: "d1", versionNo: 1, sha256: "ab", title: "Drawings set" };
    const { documents, manifest } = freezePack({
      parts: [{ ...part(), files: [] }, { ...upload, files: [file] }, { ...omitted, files: [] }],
      fields: { "exercise.title": "Filter renewal works", "exercise.reference": "DEMO/SX/0001/2026" },
      bill: null,
      appendix: null,
    });
    expect(documents.map((d) => [d.partCode, d.language, d.templateBodyVersion, d.renderedText])).toEqual([["p2", "EN", 3, "Tender for Filter renewal works (DEMO/SX/0001/2026)."]]);
    expect(manifest.map((m) => [m.partCode, m.template?.bodyVersion ?? null, m.files.length, m.omittedReason])).toEqual([
      ["p2", 3, 0, null],
      ["p10", null, 1, null],
      ["p11", null, 0, "None issued"],
    ]);
    expect(packManifest(manifest)).toEqual(manifest);
    expect(packManifest({ not: "a manifest" })).toBeNull();
  });

  it("the Appendix freezes in words, a percentage LAD fixed at award", () => {
    const a: AppendixFacts = {
      status: "COMPLETE", ladOfficerRoleCode: "HOD_CP", eotOfficerRoleCode: "HOD_CP", terminationOfficerRoleCode: "CEO", warRiskOfficerRoleCode: "CEO", arbitrationOfficerRoleCode: "CEO",
      variationLimits: [{ label: "Head of Contract & Procurement", roleCode: "HOD_CP", committeeCode: null, limit: sen("50000.00") }], pcSumWorksApply: false, pcSumWorksText: "",
      tplMinimum: sen("1000000.00"), wcMinimum: sen("500000.00"), worksInsuranceUpliftKind: "PERCENT", worksInsuranceUpliftAmount: null, worksInsuranceUpliftPct: "10", insuranceExcess: sen("10000.00"),
      ladKind: "PERCENT_OF_SUM_PER_DAY", ladAmount: null, ladPct: "0.025", sectionalCompletion: false, sections: [], dlpApplies: true, dlpMonths: 12,
      firstInterimMinimum: sen("1000.00"), subsequentInterimMinimum: sen("1000.00"), honourCertificateDays: 30,
    };
    const text = appendixText(a, (c) => (c === "HOD_CP" ? "Head of Contract & Procurement" : c === "CEO" ? "Chief Executive" : "Not set"));
    expect(text).toContain("Liquidated damages: 0.025% of the contract sum a day, fixed at award");
    expect(text).not.toContain("A percentage of the contract sum a day, ");
    expect(text).toContain("Sectional completion: Does not apply");
    expect(text).toContain("10% of the contract sum");
    expect(text).toContain("Defects liability period: 12 months");
    expect(text).not.toMatch(/HOD_CP|PERCENT_OF_SUM_PER_DAY/);
  });
});

describe("submission with the bill as an uploaded file, and files in place of merged text (SR-09, SR-11, ADR 0035)", () => {
  const billPart = part({ partCode: "p7a", printedNumber: "7a", label: "Bills of quantities", role: "BILL_OF_QUANTITIES", source: "BQ_UNPRICED", content: "BESPOKE", template: null });
  const off: Partial<SubmitInput> = { scope: { ...cleanScope, onScreenBillUsed: false, bq: [], panelBill: null } };
  it("a bill file uploaded to the bill part clears the gate; with none the part says it is missing (a mandatory part)", () => {
    expect(blockingOf(submitFaults(submit({ ...off, parts: [part(), declaration, notice, { ...billPart, liveUploads: 1 }] })))).toEqual([]);
    const s = submitFaults(submit({ ...off, parts: [part(), declaration, notice, billPart] }));
    expect(s.readiness).toEqual([{ code: "UPLOAD_MISSING", level: "block", data: { part: "7a. Bills of quantities", bill: 1 } }]);
  });
  it("an exercise let on a bill whose pack has no bill part to upload it to is told so, and it is cleared in configuration", () => {
    const s = submitFaults(submit({ ...off }));
    expect(codes(s.readiness)).toEqual(["BILL_PART_MISSING"]);
    // On screen, or a basis not let on a bill: not said.
    expect(codes(submitFaults(submit()).readiness)).toEqual([]);
    expect(codes(submitFaults(submit({ scope: { ...cleanScope, onScreenBillUsed: false, basis: { requiresBq: false } } })).readiness)).toEqual([]);
  });
  it("the bill's side of the nomination check is not made without an on-screen bill, and says so; it is never a pass", () => {
    const noNomination = behaviourProfile({ ...works, nominationAllowed: false });
    const on = submitFaults(submit({ profile: noNomination, primeCostSums: sen("18000.00") }));
    expect(codes(on.behaviour)).toEqual(["NOMINATION_NOT_FOR_TYPE"]);
    const f = submitFaults(submit({ ...off, parts: [part(), declaration, notice, { ...billPart, liveUploads: 1 }], profile: noNomination, primeCostSums: null }));
    expect(f.behaviour).toEqual([{ code: "NOMINATION_BILL_NOT_CHECKED", level: "info" }]);
    // Not a block, so it neither refuses nor reads as a pass.
    expect(blockingOf(f)).toEqual([]);
  });
  it("a merged-text part with a file is read by the notice check as a file it cannot read: warned, not blocked", () => {
    const f = submitFaults(submit({ parts: [part(), declaration, { ...notice, liveUploads: 1 }] }));
    expect(f.conditions.filter((x) => x.level === "block")).toEqual([]);
    expect(codes(f.conditions)).toContain("NOTICE_NOT_CHECKED");
  });
  it("freezing pins the file by its hash and renders no text for the part it replaces; the restriction stamp is not printed on a file", () => {
    const file = { versionId: "v9", documentId: "d9", versionNo: 2, sha256: "ab".repeat(32), title: "Form of tender (signed)" };
    const withFile = part({ liveUploads: 1 });
    const issued = issuedPart(withFile, CTX);
    const { documents, manifest } = freezePack({ parts: [{ ...issued, files: [file] }], fields: { "exercise.title": "x", "exercise.reference": "y" }, bill: null, appendix: null, stamp: { EN: "RESTRICTED", MS: "TERHAD" } });
    expect(documents).toEqual([]);
    expect(manifest[0]).toMatchObject({ partCode: "p2", source: "UPLOAD", state: "READY", template: null, files: [file], stamped: false });
    // The bill as a file, frozen the same way, and no bill is pinned.
    const bill = issuedPart({ ...billPart, liveUploads: 1 }, { ...CTX, billOnScreen: false });
    const frozen = freezePack({ parts: [{ ...bill, files: [file] }], fields: {}, bill: null, appendix: null });
    expect(frozen.documents).toEqual([]);
    expect(frozen.manifest[0]).toMatchObject({ source: "UPLOAD", bill: null, files: [file] });
    // An optional part that had nothing to issue is frozen as omitted, with the reason "Not issued".
    const none = issuedPart(part({ partCode: "p12", printedNumber: "12", source: "UPLOAD", content: "BESPOKE", template: null, mandatory: false }), CTX);
    expect(freezePack({ parts: [{ ...none, files: [] }], fields: {}, bill: null, appendix: null }).manifest[0]).toMatchObject({ state: "OMITTED", omittedReason: "Not issued", files: [] });
  });
});

describe("review S5: the bill part is mandatory where the basis needs a bill and the bill is a file", () => {
  const optionalBill = part({ partCode: "p7a", printedNumber: "7a", label: "Bills of quantities", role: "BILL_OF_QUANTITIES", source: "BQ_UNPRICED", content: "BESPOKE", template: null, mandatory: false });
  const fileCtx = { bqFinalised: false, billOnScreen: false, appendixComplete: true };
  it("an optional bill part with no file is Not issued where the basis needs no bill, but not ready where it does", () => {
    expect(partIssue(optionalBill, { ...fileCtx, basisRequiresBq: false }).state).toBe("NOT_ISSUED");
    expect(partIssue(optionalBill, { ...fileCtx, basisRequiresBq: true }).state).toBe("NOT_READY");
    // On screen, the bill's own findings judge it; an unset answer is not read as either.
    expect(partIssue(optionalBill, { ...fileCtx, billOnScreen: true, basisRequiresBq: true }).state).toBe("NOT_ISSUED");
    expect(partIssue(optionalBill, { ...fileCtx, basisRequiresBq: null }).state).toBe("NOT_ISSUED");
  });
  it("submission refuses a bill basis with the bill off, and an optional bill part with no file; a file clears it", () => {
    const off = { scope: { ...cleanScope, onScreenBillUsed: false, bq: [], panelBill: null } };
    const s = submitFaults(submit({ ...off, parts: [part(), declaration, notice, optionalBill] }));
    expect(codes(s.readiness)).toEqual(["UPLOAD_MISSING"]);
    expect(blockingOf(submitFaults(submit({ ...off, parts: [part(), declaration, notice, { ...optionalBill, liveUploads: 1 }] })))).toEqual([]);
  });
});

describe("review S6: a part an officer once omitted is warned about, with the reason, before it is issued", () => {
  it("an old omission whose content is now in order is warned (the pack is not blocked)", () => {
    const omitted = part({ state: "OMITTED", omittedReason: "Not needed for this works", mandatory: false });
    const s = submitFaults(submit({ parts: [omitted, declaration, notice] }));
    expect(s.readiness).toEqual([{ code: "PART_WAS_OMITTED", level: "warn", data: { part: "2. Form of tender", reason: "Not needed for this works" } }]);
    expect(blockingOf(s)).toEqual([]);
  });
  it("the engine's own Not issued is not an officer's omission, and an old omission with nothing to issue says nothing", () => {
    expect(codes(submitFaults(submit({ parts: [part({ state: "OMITTED", omittedReason: NOT_ISSUED_REASON, mandatory: false }), declaration, notice] })).readiness)).toEqual([]);
    expect(codes(submitFaults(submit({ parts: [part({ state: "OMITTED", omittedReason: "Not needed", mandatory: false, template: null }), declaration, notice] })).readiness)).toEqual([]);
  });
});
