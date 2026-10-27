import { describe, expect, it } from "vitest";

import { SPEC_METHODS } from "@/lib/method/fixture";
import { parseSen } from "@/lib/money";

import { evaluateAward, type AwardFacts } from "./evaluate";
import { awardFindingText } from "./labels";
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
    ladAmount: null, ladUnit: "", retentionPercent: null, retentionCapPercent: null, dlpMonths: 12, erpCommitmentNo: null, erpCommitmentKind: null, indentReceivedOn: null, signatoryName: null, issuedOn: null, contractNumber: null, wcBasis: null,
  },
  exercise: { opening: null, reference: "SX/1", title: "Works", status: "DOCUMENTS_IN_PREPARATION", packKindSnapshot: null, regime: "tender", appointmentRuleKey: "APP_TENDER", appointmentRuleLabel: "Tender", termsBandKey: null, termsState: "NONE_IN_REGIME", terms: null, contractTypeCode: "works", estimate: parseSen("2200000"), justificationReasonCode: null, dossierReference: null },
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
    { id: "t2", code: "decl", nameEn: "Declaration", formCode: "F2", revisionDate: null, bodyMs: null, bodyEn: "I, for {{awardee.name}}, declare.", primaryLanguage: null, bodyVersion: 1 },
  ],
  indentPattern: null,
  contractSeriesKey: "contract",
  wcRequired: false,
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

  // Founder, 2026-10-20: English only. The declaration template was Malay-only and rendered in Malay; it is English now, and a template with only a Malay text has no text to issue.
  it("a template is rendered in English, and one with only a Malay text has no text", () => {
    expect(evaluateAward(facts()).documents[1]).toMatchObject({ kind: "SUCCESSFUL_BIDDER_DECLARATION", language: "EN", state: "OK" });
    const malayOnly = facts().templates.map((t) => (t.id === "t2" ? { ...t, bodyEn: null, bodyMs: "Saya, bagi pihak {{awardee.name}}, mengaku." } : t));
    expect(evaluateAward(facts({ templates: malayOnly })).documents[1]).toMatchObject({ kind: "SUCCESSFUL_BIDDER_DECLARATION", state: "NO_TEXT" });
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

  it("an award opened as a Letter of Acceptance is judged as one when the policy now names an indent — its committee check still applies — and refused as changed", () => {
    const base = facts();
    const f = facts({
      policy: { ...base.policy, tenderInstrument: "WORK_INDENT" },
      appointment: { ...base.appointment!, steps: [{ ...base.appointment!.steps[0], act: "MR" }] },
    });
    const ev = evaluateAward(f);
    const codes = ev.issueFaults.map((x) => x.code);
    expect(codes).toContain("INSTRUMENT_CHANGED");
    expect(codes).toContain("NO_COMMITTEE_APPROVAL_IN_ROUTE");
    expect(ev.issueFaults.find((x) => x.code === "INSTRUMENT_CHANGED")!.data).toEqual({ opened: "LETTER_OF_ACCEPTANCE", now: "WORK_INDENT" });
    expect(ev.documents.map((d) => d.kind)).toEqual(["LETTER_OF_ACCEPTANCE", "SUCCESSFUL_BIDDER_DECLARATION"]);
    expect(evaluateAward({ ...f, award: { ...f.award, status: "DRAFT" } }).submitFaults.map((x) => x.code)).toContain("INSTRUMENT_CHANGED");
  });

  it("an award opened as an indent is judged as one when the policy now names a Letter of Acceptance — its indent checks still apply — and refused as changed", () => {
    const base = facts();
    const f = facts({ award: { ...base.award, instrumentKind: "WORK_INDENT" }, policy: { ...base.policy, tenderInstrument: "LETTER_OF_ACCEPTANCE" } });
    const ev = evaluateAward(f);
    const codes = ev.issueFaults.map((x) => x.code);
    expect(codes).toContain("INSTRUMENT_CHANGED");
    expect(codes).toContain("INDENT_NUMBER_REQUIRED");
    expect(ev.documents.map((d) => d.kind)).not.toContain("SUCCESSFUL_BIDDER_DECLARATION");
  });

  it("FR-MTD-009: a dossier method's faults refuse issue too, not only submission", () => {
    const direct = SPEC_METHODS.find((m) => m.requiresDossier)!;
    const codes = evaluateAward(facts({ method: direct })).issueFaults.map((x) => x.code);
    expect(codes).toContain("EVIDENCE_NOT_ATTACHED");
  });

  it("BD-14: the text is not frozen while a value only the issue fills is missing", () => {
    const ok = evaluateAward(facts(), { contractNumber: "KP/T/004/2026", issueDate: "2026-09-30", signatoryName: "Bala Krishnan" });
    expect(ok.documents[0].unfilled).toEqual([]);
    const bad = evaluateAward(facts(), { contractNumber: "", issueDate: "2026-09-30", signatoryName: "Bala Krishnan" });
    expect(bad.documents[0].unfilled).toEqual(["contract.number"]);
    expect(bad.issueFaults.map((x) => x.code)).toContain("ISSUE_VALUE_UNFILLED");
    // The preview shows the placeholder by design and is not held to it.
    expect(evaluateAward(facts()).documents[0].unfilled).toEqual([]);
  });

  it("a workmen's compensation requirement with no basis set on the award refuses issue", () => {
    expect(evaluateAward(facts({ wcRequired: true })).issueFaults.map((x) => x.code)).toEqual(["WC_BASIS_REQUIRED"]);
    expect(evaluateAward(facts({ wcRequired: true, award: { ...facts().award, wcBasis: "UNCOVERED_WAGES" } })).issueFaults).toEqual([]);
  });
});

describe("FR-MTD-009 with the document store: the dossier's evidence, counted and snapshotted", () => {
  const direct = SPEC_METHODS.find((m) => m.requiresDossier)!;
  const dossierEx = { ...facts().exercise, justificationReasonCode: "SOLE_DISTRIBUTOR", dossierReference: "DA/1" };
  const pin = { attachmentId: "a1", documentId: "d1", versionId: "v1", versionNo: 1, sha256: "a".repeat(64), title: "OEM sole distributor letter", purpose: "DOSSIER_EVIDENCE" };
  const snapshot = { v: 1, purposes: ["DOSSIER_EVIDENCE"], takenOn: "2026-09-15", pins: [pin] };
  const codesOf = (x: Partial<AwardFacts>) => evaluateAward(facts({ method: direct, exercise: dossierEx, ...x })).issueFaults.map((f) => f.code);

  it("one live attachment, sent for approval on it and still standing: nothing from the dossier refuses issue", () => {
    const codes = codesOf({ dossierEvidence: { count: 1, snapshot, withdrawnVersionIds: [] } });
    expect(codes).not.toContain("EVIDENCE_NOT_ATTACHED");
    expect(codes).not.toContain("EVIDENCE_NOT_SNAPSHOTTED");
    expect(codes).not.toContain("EVIDENCE_WITHDRAWN_SINCE_JUDGED");
  });
  it("a dossier award with no snapshot is refused at issue, naming cancel and reopen", () => {
    const ev = evaluateAward(facts({ method: direct, exercise: dossierEx, dossierEvidence: { count: 1, snapshot: null, withdrawnVersionIds: [] } }));
    const f = ev.issueFaults.find((x) => x.code === "EVIDENCE_NOT_SNAPSHOTTED")!;
    expect(f).toBeTruthy();
    expect(awardFindingText(f)).toMatch(/Cancel and reopen this award/); // wording shortened by note 0005, founder 2026-10-19; the meaning pinned is unchanged
  });
  it("a snapshotted version withdrawn since refuses issue, naming the document and cancel and reopen", () => {
    const ev = evaluateAward(facts({ method: direct, exercise: dossierEx, dossierEvidence: { count: 1, snapshot, withdrawnVersionIds: ["v1"] } }));
    const f = ev.issueFaults.find((x) => x.code === "EVIDENCE_WITHDRAWN_SINCE_JUDGED")!;
    expect(awardFindingText(f)).toMatch(/OEM sole distributor letter/);
    expect(awardFindingText(f)).toMatch(/Cancel this award and open it again/);
  });
  it("submission passes on one live attachment and refuses on none", () => {
    const draft = { ...facts().award, status: "DRAFT" as const };
    const sub = (count: number) => evaluateAward(facts({ method: direct, exercise: dossierEx, award: draft, appointment: null, dossierEvidence: { count, snapshot: null, withdrawnVersionIds: [] } })).submitFaults.map((x) => x.code);
    expect(sub(1)).not.toContain("EVIDENCE_NOT_ATTACHED");
    expect(sub(0)).toContain("EVIDENCE_NOT_ATTACHED");
  });
  it("a method that keeps no dossier asks nothing of the snapshot", () => {
    expect(evaluateAward(facts({ dossierEvidence: { count: 0, snapshot: null, withdrawnVersionIds: [] } })).issueFaults).toEqual([]);
  });
});

// Phase 0.3 item 15 (RSAJ Q22(d)): a method's own quotation key comes before the award controls', so only Schedule of Rates takes the quotation's number.
describe("the contract number of a quotation award", () => {
  const quotation = (methodKey: "QUOTATION_NUMBER" | null) => {
    const base = facts();
    return evaluateAward(facts({ exercise: { ...base.exercise, regime: "quotation", reference: "RSAJ/KP/QJB/007/26" }, method: { ...base.method!, quotationContractKey: methodKey }, policy: { ...base.policy, quotationContractKey: "CONTRACT_SERIES" } })).contractNumber;
  };
  it("is the quotation's own number where the method says so, else the award controls' choice", () => {
    expect(quotation("QUOTATION_NUMBER")).toEqual({ source: "QUOTATION_NUMBER", number: "RSAJ/KP/QJB/007/26" });
    expect(quotation(null)).toEqual({ source: "SERIES", seriesKey: "contract" });
  });
});
