import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import type { OpeningGateFacts } from "@/lib/opening/award-gate";

import { submitFaults } from "./appointment";
import { awardOpenRefusal, exerciseOpenForAward, issueFaults, openingFindings, type IssueInput } from "./gate";
import { awardFindingText } from "./labels";

/**
 * 6.7 (X-9, C-7, C-8; flagged against accepted 6.11, new tests): the award follows the opening.
 * The exercise must be Opened (its main opening finalised); the openings' own checks — the signed
 * schedule's scan, admitted late tenders opened, the estimate's copy finding explained — and the
 * awardee a party carried to evaluation, compared as a party (an award naming none never matches).
 * An exercise not published through 6.5 is asked none of it.
 */

const facts = (over: Partial<OpeningGateFacts> = {}): OpeningGateFacts => ({ applies: true, openings: [{ kind: "MAIN", sequenceNo: 1, finalised: true, liveScans: 1, copyCheck: "MATCH", explained: false, admittedEnvelopeId: null }], admittedEnvelopeIds: [], carriedPartyIds: new Set(["p1"]), ...over });
const clear: IssueInput = {
  status: "APPROVED",
  today: "2026-11-30",
  exerciseStatus: "OPENED",
  exercisePackKind: "TENDER",
  exerciseWindow: { phase: "CLOSED", changePending: false },
  commitment: null,
  sourcingPermitted: true,
  instrument: { kind: "LETTER_OF_ACCEPTANCE" },
  valueFaults: [],
  dossierFaults: [],
  appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [{ committee: "Tender Board", act: "A", outcome: "CARRIED" }] },
  signatory: { ok: true, roleCode: "FD", roleLabel: "Functional Director", ruleKey: "k", ruleLabel: "l", clause: "c", recommenders: [], delegable: false },
  indent: null,
  distribution: { rows: [{}] },
  documents: [{ kind: "LETTER_OF_ACCEPTANCE", state: "OK", templateName: "LoA", missing: [], unknown: [], unfilled: [] }],
  variant: null,
  terms: null,
  bond: { required: true, reason: "", basis: { state: "SET", amount: parseSen("1"), basis: "CONTRACT_PRICE" } },
  contractNumber: { source: "SERIES", seriesKey: "contract" },
  startDate: "2026-12-01",
  wc: { required: false, basis: null },
};
const issue = (opening: IssueInput["opening"], over: Partial<IssueInput> = {}) => issueFaults({ ...clear, ...over, opening }).map((f) => f.code);

describe("issuing after the opening", () => {
  it("Opened, the schedule's scan attached, the awardee carried: nothing more asked", () => expect(issue({ facts: facts(), awardeePartyId: "p1" })).toEqual([]));
  it("published but not opened: EXERCISE_NOT_OPEN, in the opening's words", () => {
    const f = issueFaults({ ...clear, exerciseStatus: "OPENING_IN_PROGRESS", opening: { facts: facts(), awardeePartyId: "p1" } }).find((x) => x.code === "EXERCISE_NOT_OPEN");
    expect(awardFindingText(f!)).toMatch(/bids have not been opened, or its opening is not finalised/);
  });
  it("the scan missing, an unexplained copy finding, an admitted late tender unopened", () => {
    expect(issue({ facts: facts({ openings: [{ kind: "MAIN", sequenceNo: 1, finalised: true, liveScans: 0, copyCheck: "MISMATCH", explained: false, admittedEnvelopeId: null }] }), awardeePartyId: "p1" })).toEqual(["SIGNED_SCHEDULE_NOT_ATTACHED", "ESTIMATE_COPY_UNEXPLAINED"]);
    expect(issue({ facts: facts({ admittedEnvelopeIds: ["e4"] }), awardeePartyId: "p1" })).toEqual(["ADMITTED_UNOPENED"]);
  });
  it("the awardee compared as a party: another, or none, is refused (C-7)", () => {
    expect(issue({ facts: facts(), awardeePartyId: "p2" })).toEqual(["AWARDEE_NOT_CARRIED"]);
    expect(issue({ facts: facts(), awardeePartyId: null })).toEqual(["AWARDEE_NOT_NAMED"]);
    expect(awardFindingText({ code: "AWARDEE_NOT_CARRIED", level: "block" })).toMatch(/not carried to evaluation/);
  });
  it("not published through 6.5 (Phase 1): nothing asked", () => {
    expect(openingFindings(null)).toEqual([]);
    expect(issue(null, { exerciseStatus: "DOCUMENTS_IN_PREPARATION", exercisePackKind: null })).toEqual([]);
  });
});

describe("opening the award and sending it for approval", () => {
  it("the open refusal names the opening once published", () => {
    expect(exerciseOpenForAward("OPENED", "QUOTATION", { phase: "CLOSED", changePending: false })).toBe(true);
    expect(awardOpenRefusal("TENDER", "ADVERTISED", { phase: "CLOSED", changePending: false })).toMatch(/bids are opened and the opening's schedule is finalised/);
    expect(awardOpenRefusal("TENDER", "OPENING_IN_PROGRESS", { phase: "CLOSED", changePending: false })).toMatch(/Bids and opening/);
  });
  it("submission asks the openings too", () => {
    const route = { ok: true as const, ruleKey: "k", ruleLabel: "l", clause: null, approverCode: "CEO", committeeCode: null, chain: [], warnings: [], source: "DAL" as const, overrideIssue: null, core: null } as unknown as Parameters<typeof submitFaults>[0]["route"];
    const sub = (o: Parameters<typeof submitFaults>[0]["opening"]) => submitFaults({ status: "DRAFT", today: "2026-11-30", exerciseStatus: "OPENED", exercisePackKind: "TENDER", exerciseWindow: { phase: "CLOSED", changePending: false }, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route, opening: o }).map((f) => f.code);
    expect(sub({ facts: facts(), awardeePartyId: "p1" })).toEqual([]);
    expect(sub({ facts: facts({ openings: [{ kind: "MAIN", sequenceNo: 1, finalised: true, liveScans: 0, copyCheck: null, explained: false, admittedEnvelopeId: null }] }), awardeePartyId: "p1" })).toEqual(["SIGNED_SCHEDULE_NOT_ATTACHED"]);
    expect(awardFindingText({ code: "EXERCISE_NOT_OPENED", level: "block" })).toMatch(/Bids and opening/);
  });
});
