import { describe, expect, it } from "vitest";

import { contractDateOf, dateCorrectionFaults, readySince } from "./contract-date";
import { decideFaults, endorsement, nextIteration, openReview, statusAfter, submitFaults } from "./legal";
import { briefingFaults, briefingMissing, contractorSignFaults, personFaults, signFaults, stampFaults, type SignInputs } from "./sign";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const MET = { ready: true, items: [{ key: "RETURNED", state: "MET" as const, detail: [] }, { key: "BOND", state: "MET" as const, detail: [] }, { key: "INSURANCE", state: "MET" as const, detail: [] }] };

describe("legal review (FR-CON-006)", () => {
  const sub = { status: "IN_PREPARATION" as const, officeCode: "LEGAL", submissionDocuments: 1, formationFaults: 0, reviews: [] };
  it("goes while in preparation or returned, with documents, the office frozen and formation complete", () => {
    expect(submitFaults(sub)).toEqual([]);
    expect(submitFaults({ ...sub, status: "RETURNED_FOR_AMENDMENT", reviews: [{ iteration: 1, decision: "RETURNED", submittedOn: "2026-09-20", decidedOn: "2026-09-22" }] })).toEqual([]);
    expect(codes(submitFaults({ ...sub, status: "LEGALLY_ENDORSED" }))).toEqual(["NOT_IN_PREPARATION"]);
    expect(codes(submitFaults({ ...sub, officeCode: null }))).toEqual(["LEGAL_OFFICE_NOT_FROZEN"]);
    expect(codes(submitFaults({ ...sub, submissionDocuments: 0 }))).toEqual(["NO_SUBMISSION_DOCUMENTS"]);
    expect(codes(submitFaults({ ...sub, formationFaults: 2 }))).toEqual(["FORMATION_INCOMPLETE"]);
    expect(codes(submitFaults({ ...sub, reviews: [{ iteration: 1, decision: null, submittedOn: "2026-09-20", decidedOn: null }] }))).toEqual(["REVIEW_OPEN"]);
  });
  it("iterations have no limit; a returned one opens the next only on resubmission", () => {
    const many = Array.from({ length: 12 }, (_, n) => ({ iteration: n + 1, decision: "RETURNED" as const, submittedOn: "2026-09-01", decidedOn: "2026-09-02" }));
    expect(nextIteration(many)).toBe(13);
    expect(nextIteration([])).toBe(1);
    expect(openReview(many)).toBeNull();
    expect(statusAfter("RETURNED")).toBe("RETURNED_FOR_AMENDMENT");
    expect(statusAfter("ENDORSED")).toBe("LEGALLY_ENDORSED");
  });
  it("returned needs comments (typed or attached); the day neither future nor before it was sent", () => {
    const open = { iteration: 2, decision: null, submittedOn: "2026-09-22", decidedOn: null };
    expect(codes(decideFaults({ open, decision: "RETURNED", comments: "", commentsAttached: false, decidedOn: "2026-09-24", today: "2026-09-25" }))).toEqual(["COMMENTS_REQUIRED"]);
    expect(decideFaults({ open, decision: "RETURNED", comments: "", commentsAttached: true, decidedOn: "2026-09-24", today: "2026-09-25" })).toEqual([]);
    expect(decideFaults({ open, decision: "ENDORSED", comments: "", commentsAttached: false, decidedOn: "2026-09-22", today: "2026-09-25" })).toEqual([]);
    expect(codes(decideFaults({ open, decision: "ENDORSED", comments: "", commentsAttached: false, decidedOn: "2026-09-21", today: "2026-09-25" }))).toEqual(["BEFORE_SUBMISSION"]);
    expect(codes(decideFaults({ open, decision: "ENDORSED", comments: "", commentsAttached: false, decidedOn: "2026-09-26", today: "2026-09-25" }))).toEqual(["FUTURE_DATE"]);
    expect(codes(decideFaults({ open: null, decision: "ENDORSED", comments: "", commentsAttached: false, decidedOn: "2026-09-25", today: "2026-09-25" }))).toEqual(["NO_OPEN_REVIEW"]);
  });
  it("the endorsement in force is the last review's, where it endorsed", () => {
    expect(endorsement([{ iteration: 1, decision: "ENDORSED", submittedOn: "a", decidedOn: "b" }, { iteration: 2, decision: null, submittedOn: "c", decidedOn: null }])).toBeNull();
    expect(endorsement([{ iteration: 1, decision: "RETURNED", submittedOn: "a", decidedOn: "b" }, { iteration: 2, decision: "ENDORSED", submittedOn: "c", decidedOn: "d" }])?.iteration).toBe(2);
  });
});

describe("the contractor's signature (FR-CON-007, 008)", () => {
  const base = { status: "LEGALLY_ENDORSED" as const, gate: MET, resolutionLive: true, alreadySigned: false, signatory: { name: "Tan Ah Kow", icNumber: "700101-10-5555" }, witness: { name: "Lim Mei Ling", icNumber: "800202105556" }, signedOn: "2026-09-29", today: "2026-09-30", endorsedOn: "2026-09-28" };
  it("all clear: nothing refuses", () => {
    expect(contractorSignFaults(base)).toEqual([]);
  });
  it("refused where no resolution is on file", () => {
    expect(codes(contractorSignFaults({ ...base, resolutionLive: false }))).toEqual(["NO_RESOLUTION"]);
  });
  it("refused while the gate is not met, naming each item", () => {
    const gate = { ready: false, items: [{ key: "RETURNED", state: "MET" as const, detail: [] }, { key: "BOND", state: "NOT_MET" as const, detail: [] }, { key: "INSURANCE", state: "NOT_SET" as const, detail: ["WC_NOT_CHECKED"] }] };
    expect(contractorSignFaults({ ...base, gate }).map((f) => f.data?.item)).toEqual(["BOND", "INSURANCE"]);
  });
  it("both identity-card numbers are captured, in shape", () => {
    expect(personFaults({ name: "", icNumber: "12" })).toEqual(["NAME_REQUIRED", "IC_FORMAT"]);
    expect(contractorSignFaults({ ...base, witness: { name: "Lim", icNumber: "" } }).map((f) => [f.code, f.data?.fault])).toEqual([["WITNESS", "IC_REQUIRED"]]);
  });
  it("not before endorsement, not in the future, not twice, not before endorsement is recorded", () => {
    expect(codes(contractorSignFaults({ ...base, signedOn: "2026-09-27" }))).toEqual(["BEFORE_ENDORSEMENT"]);
    expect(codes(contractorSignFaults({ ...base, signedOn: "2026-10-01" }))).toEqual(["FUTURE_DATE"]);
    expect(codes(contractorSignFaults({ ...base, alreadySigned: true }))).toEqual(["ALREADY_SIGNED"]);
    expect(codes(contractorSignFaults({ ...base, status: "PENDING_LEGAL_ENDORSEMENT" }))).toEqual(["NOT_ENDORSED"]);
  });
});

describe("signFaults: the RSAJ signature (FR-CON-008, 009, FR-REQ-016, OD-4)", () => {
  const clear: SignInputs = { status: "LEGALLY_ENDORSED", gate: MET, resolutionLive: true, contractorSignedOn: "2026-09-29", witnessRecorded: true, formationFaults: 0, commitment: null, signatoryCond: "CONTRACT_AGREEMENT", signatory: { ok: true }, signer: [], baselineBlocks: 0, today: "2026-09-30" };
  it("all clear → []", () => {
    expect(signFaults(clear)).toEqual([]);
  });
  it.each([
    ["the bond not verified", { gate: { ready: false, items: [{ key: "BOND", state: "NOT_MET" as const, detail: [] }] } }, "GATE_NOT_MET"],
    ["insurances not set", { gate: { ready: false, items: [{ key: "INSURANCE", state: "NOT_SET" as const, detail: ["REQUIREMENTS_NOT_SET"] }] } }, "GATE_NOT_MET"],
    ["the Letter of Acceptance not returned", { gate: { ready: false, items: [{ key: "RETURNED", state: "NOT_MET" as const, detail: [] }] } }, "GATE_NOT_MET"],
    ["WC on uncovered wages not checked", { gate: { ready: false, items: [{ key: "INSURANCE", state: "NOT_SET" as const, detail: ["WC_NOT_CHECKED"] }] } }, "GATE_NOT_MET"],
    ["no resolution", { resolutionLive: false }, "NO_RESOLUTION"],
    ["legal not endorsed", { status: "PENDING_LEGAL_ENDORSEMENT" as const }, "NOT_ENDORSED"],
    ["a check incomplete", { formationFaults: 1 }, "FORMATION_INCOMPLETE"],
    ["the requisition not approved", { commitment: { code: "NOT_APPROVED" as const, outstanding: "Finance Director" } }, "COMMITMENT"],
    ["the signatory condition not frozen", { signatoryCond: null }, "SIGNATORY_COND_NOT_FROZEN"],
    ["the signatory not resolved", { signatory: { ok: false as const, fault: "SIGNATORY_UNRESOLVED" as const } }, "SIGNATORY_NOT_RESOLVED"],
    ["the signer not the holder on the day", { signer: ["NOT_HOLDER" as const] }, "SIGNER"],
    ["the contractor not signed", { contractorSignedOn: null }, "CONTRACTOR_NOT_SIGNED"],
    ["the witness not recorded", { witnessRecorded: false }, "WITNESS_NOT_RECORDED"],
    ["the baseline incomplete", { baselineBlocks: 2 }, "BASELINE_INCOMPLETE"],
  ])("%s, alone, refuses", (_name, change, code) => {
    expect(codes(signFaults({ ...clear, ...change }))).toEqual([code]);
  });
  it("the commitment fault names the pending step", () => {
    expect(signFaults({ ...clear, commitment: { code: "NOT_APPROVED", outstanding: "Finance Director" } })[0].data).toEqual({ fault: "NOT_APPROVED", outstanding: "Finance Director" });
  });
  it("an executed contract is not signed again", () => {
    expect(codes(signFaults({ ...clear, status: "EXECUTED" }))).toEqual(["ALREADY_EXECUTED"]);
  });
});

describe("the Contract Date (FR-CON-009, OD-1 A)", () => {
  it("is the organisation's day of the act, never UTC's", () => {
    // 2026-09-29 17:30 UTC is already 30 September in Kuala Lumpur.
    expect(contractDateOf(new Date("2026-09-29T17:30:00Z"), "Asia/Kuala_Lumpur")).toBe("2026-09-30");
    expect(contractDateOf(new Date("2026-09-29T17:30:00Z"), null)).toBeNull();
  });
  it("ready since the latest of the days its conditions were met", () => {
    expect(readySince(["2026-09-24", null, "2026-09-28", "2026-09-26"])).toBe("2026-09-28");
    expect(readySince([null])).toBeNull();
  });
  it("corrected only to an earlier day, never before ready-to-sign, with a reason", () => {
    const base = { executed: true, current: "2026-10-01", proposed: "2026-09-29", readySince: "2026-09-28", reason: "Signed on paper on the 29th; recorded on the 1st.", signed: { contractor: "2026-09-26", witness: "2026-09-26" } };
    expect(dateCorrectionFaults(base)).toEqual([]);
    expect(dateCorrectionFaults({ ...base, proposed: "2026-09-28" })).toEqual([]);
    expect(codes(dateCorrectionFaults({ ...base, proposed: "2026-10-01" }))).toEqual(["NOT_EARLIER"]);
    expect(codes(dateCorrectionFaults({ ...base, proposed: "2026-10-02" }))).toEqual(["NOT_EARLIER"]);
    expect(codes(dateCorrectionFaults({ ...base, proposed: "2026-09-27" }))).toEqual(["BEFORE_READY"]);
    expect(codes(dateCorrectionFaults({ ...base, reason: " " }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(dateCorrectionFaults({ ...base, readySince: null }))).toEqual(["READY_DAY_NOT_FROZEN"]);
    expect(codes(dateCorrectionFaults({ ...base, executed: false }))).toEqual(["NOT_EXECUTED"]);
  });
});

describe("stamping (FR-CON-011)", () => {
  const base = { status: "EXECUTED" as const, stampedOn: "2026-10-01", reference: "LHDN/STM/2026/0042", contractDate: "2026-09-30", today: "2026-10-01" };
  it("fully executed only with both the day and the reference", () => {
    expect(stampFaults(base)).toEqual([]);
    expect(codes(stampFaults({ ...base, reference: "" }))).toEqual(["REFERENCE_REQUIRED"]);
    expect(codes(stampFaults({ ...base, stampedOn: null }))).toEqual(["DAY_REQUIRED"]);
  });
  it("on the Contract Date is allowed, before it is not; never in the future", () => {
    expect(stampFaults({ ...base, stampedOn: "2026-09-30" })).toEqual([]);
    expect(codes(stampFaults({ ...base, stampedOn: "2026-09-29" }))).toEqual(["BEFORE_CONTRACT_DATE"]);
    expect(codes(stampFaults({ ...base, stampedOn: "2026-10-02" }))).toEqual(["FUTURE_DATE"]);
  });
  it("only an executed contract, once", () => {
    expect(codes(stampFaults({ ...base, status: "LEGALLY_ENDORSED" }))).toEqual(["NOT_EXECUTED"]);
    expect(codes(stampFaults({ ...base, status: "STAMPED" }))).toEqual(["ALREADY_STAMPED"]);
  });
});

describe("the Integrity Pact Stage Three briefing (FR-CON-010, a Should)", () => {
  it("is shown missing on a signed contract without one, and blocks nothing", () => {
    expect(briefingMissing("EXECUTED", false)).toBe(true);
    expect(briefingMissing("STAMPED", true)).toBe(false);
    expect(briefingMissing("LEGALLY_ENDORSED", false)).toBe(false);
  });
  it("needs participants on both sides and a day not in the future", () => {
    const base = { status: "EXECUTED" as const, exists: false, participants: 2, attendees: 1, heldOn: "2026-09-30", today: "2026-09-30" };
    expect(briefingFaults(base)).toEqual([]);
    expect(codes(briefingFaults({ ...base, participants: 0, attendees: 0, heldOn: "2026-10-01" }))).toEqual(["NO_PARTICIPANTS", "NO_ATTENDEES", "FUTURE_DATE"]);
    expect(codes(briefingFaults({ ...base, status: "IN_PREPARATION" }))).toEqual(["NOT_YET_ENDORSED"]);
    expect(codes(briefingFaults({ ...base, exists: true }))).toEqual(["ALREADY_RECORDED"]);
  });
});
