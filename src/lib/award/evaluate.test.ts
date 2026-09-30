import { describe, expect, it } from "vitest";

import { SPEC_METHODS } from "@/lib/method/fixture";
import { parseSen } from "@/lib/money";

import { evaluateAward, type AwardFacts } from "./evaluate";
import { AWARD_MATRIX } from "./fixture";

const tender = SPEC_METHODS.find((m) => m.code === "open_tender")!;
const record = { committee: "Tender Board", meetingReference: "S/3", meetingDate: new Date("2026-09-20T00:00:00Z"), subject: "", matterRef: null, outcome: "CARRIED" as const, decisionDate: new Date("2026-09-20T00:00:00Z"), quorum: { required: 3, present: 3, recused: 0 }, votingRule: { rule: null, provenance: null }, notApproved: null, note: "", votes: [] };

const facts = (x: Partial<AwardFacts> = {}): AwardFacts => ({
  today: "2026-09-30",
  organisationName: "Demo",
  award: {
    status: "APPROVED", reference: "AW/1", instrumentKind: "LETTER_OF_ACCEPTANCE", value: parseSen("2100000"), awardeeName: "Demo Works Sdn Bhd", awardeeRegistrationNo: "0000000-X", awardeeAddress: "1 Demo Lane",
    completionPeriod: 24, completionUnit: "MONTHS", startDate: "2026-11-01", commencedOn: null, regulatedActivity: false,
    bondRequired: true, bondNotRequiredReason: "", bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondBasisAmount: null, bondValidityExtraMonths: 12,
    ladAmount: null, ladUnit: "", retentionPercent: null, retentionCapPercent: null, dlpMonths: 12, erpCommitmentNo: null, indentReceivedOn: null, signatoryName: null, issuedOn: null, contractNumber: null,
  },
  exercise: { reference: "SX/1", title: "Works", status: "DOCUMENTS_IN_PREPARATION", regime: "tender", appointmentRuleKey: "APP_TENDER", appointmentRuleLabel: "Tender", termsBandKey: null, termsState: "NONE_IN_REGIME", terms: null, contractTypeCode: "works", estimate: parseSen("2200000"), justificationReasonCode: null, dossierReference: null },
  requisition: { reference: "RQ/1", status: "SOURCING", sourcingPermitted: true, approvedValue: parseSen("2500000"), route: { status: "APPROVED", steps: [{ sequence: 1, roleLabel: "Chief Executive", decision: "DONE" }] } },
  otherAwards: [],
  policy: { tenderInstrument: "LETTER_OF_ACCEPTANCE", quotationInstrument: "WORK_INDENT", indentValidityDays: 14, commencementGraceDays: 7, acceptanceReturnDays: 14, preContractUnitCode: null, postContractUnitCode: null, quotationContractKey: "INDENT_NUMBER", regulatedActivityLabel: null, loaTemplateId: "t1", declarationTemplateId: "t2", coveringMemoTemplateId: null, provenance: "ASSUMED" },
  funder: { dal: AWARD_MATRIX, override: null, supersedes: false },
  method: tender,
  routePeople: { absentRoleCodes: [], requesterHolds: () => false },
  appointment: { status: "APPROVED", openedAt: new Date("2026-09-15T00:00:00Z"), steps: [{ id: "s1", sequence: 1, roleCode: "TBC", roleLabel: "Tender Board", act: "A", committeeCode: "TBC", decision: "DONE", decidedByName: "Tender Board", decidedOn: new Date("2026-09-20T00:00:00Z"), receivedOn: null, cited: { record, minuted: true } }] },
  recipients: [{ id: "r1", instrumentKind: "LETTER_OF_ACCEPTANCE", nameEn: "Finance", mandatory: true, onlyWhenRegulated: false, sortOrder: 1, retiredOn: null }],
  variants: [],
  templates: [
    { id: "t1", code: "loa", nameEn: "LoA", formCode: "F1", revisionDate: null, bodyMs: null, bodyEn: "To {{awardee.name}}\n\nContract {{contract.number}}, signed by {{signatory.name}}, {{signatory.office}}. The {{committee.name}} decided on {{committee.decisionDate}}.", primaryLanguage: null, bodyVersion: 3 },
    { id: "t2", code: "decl", nameEn: "Declaration", formCode: "F2", revisionDate: null, bodyMs: "Saya, bagi pihak {{awardee.name}}, mengaku.", bodyEn: null, primaryLanguage: null, bodyVersion: 1 },
  ],
  indentPattern: null,
  contractSeriesKey: "contract",
  ...x,
});

describe("evaluating an award", () => {
  it("an approved RM2.1 million Letter of Acceptance with everything in place is ready to issue, signed by the Functional Director", () => {
    const ev = evaluateAward(facts());
    expect(ev.issueFaults).toEqual([]);
    expect(ev.signatory).toMatchObject({ ok: true, roleCode: "FD" });
    expect(ev.requiredBond).toEqual({ state: "SET", amount: parseSen("105000"), basis: "CONTRACT_PRICE" });
    expect(ev.completion).toBe("2028-11-01");
    expect(ev.bondUntil).toBe("2029-11-01");
  });

  it("the preview says what only the issue fills; the issue renders the real values and the committee block from the decision record", () => {
    const preview = evaluateAward(facts()).documents[0].rendered!.paragraphs[1];
    expect(preview).toContain("(allocated on issue)");
    const issued = evaluateAward(facts(), { contractNumber: "KP/T/004/2026", issueDate: "2026-09-30", signatoryName: "Bala Krishnan" }).documents[0].rendered!.paragraphs[1];
    expect(issued).toBe("Contract KP/T/004/2026, signed by Bala Krishnan, Functional Director. The Tender Board decided on 20 September 2026.");
  });

  it("a Malay template is rendered in Malay", () => {
    expect(evaluateAward(facts()).documents[1]).toMatchObject({ kind: "SUCCESSFUL_BIDDER_DECLARATION", language: "MS", state: "OK" });
  });

  it("the committee's decision not yet cited blocks issue, naming the committee", () => {
    const f = facts({ award: { ...facts().award, status: "PENDING_APPROVAL" }, appointment: { status: "PENDING", openedAt: new Date("2026-09-15T00:00:00Z"), steps: [{ ...facts().appointment!.steps[0], decision: "PENDING", cited: null }] } });
    const codes = evaluateAward(f).issueFaults.map((x) => x.code);
    // The letter quotes the committee's decision, so its text is incomplete until one is cited too.
    expect(codes).toEqual(["NOT_APPROVED_YET", "APPOINTMENT_NOT_APPROVED", "COMMITTEE_DECISION_NOT_RECORDED", "TEMPLATE_INCOMPLETE"]);
  });

  it("FR-REQ-016: the requisition's route not approved blocks, naming its pending step", () => {
    const f = facts({ requisition: { ...facts().requisition, status: "PENDING_APPROVAL", route: { status: "PENDING", steps: [{ sequence: 1, roleLabel: "Chief Executive", decision: "PENDING" }] } } });
    expect(evaluateAward(f).issueFaults).toEqual([{ code: "REQUISITION_NOT_APPROVED", level: "block", data: { step: "Chief Executive" } }]);
  });

  it("a template naming a field with no value blocks issue", () => {
    const f = facts({ award: { ...facts().award, awardeeName: "" } });
    expect(evaluateAward(f).issueFaults.map((x) => x.code)).toContain("TEMPLATE_INCOMPLETE");
  });

  it("an award above the requisition's approved value, with the others, cannot go for approval", () => {
    const ev = evaluateAward(facts({ award: { ...facts().award, status: "DRAFT" }, otherAwards: [parseSen("400001")] }));
    expect(ev.submitFaults.map((x) => x.code)).toContain("EXCEEDS_APPROVED_VALUE");
  });

  it("with no issue in force nothing can be judged, and it says so", () => {
    expect(evaluateAward(facts({ funder: null })).issueFaults.map((x) => x.code)).toContain("NO_ISSUE_IN_FORCE");
  });
});
