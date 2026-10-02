import { describe, expect, it } from "vitest";

import type { EvaluationGateFacts } from "@/lib/evaluation/award-gate";
import { parseSen } from "@/lib/money";

import { submitFaults } from "./appointment";
import { awardOpenRefusal, evaluationFindings, exerciseOpenForAward, issueFaults, type EvaluationForAward, type IssueInput } from "./gate";
import { awardFindingText } from "./labels";

/**
 * 6.8 (E-9, flagged against accepted 6.11; new tests only): the award follows the evaluation. For an
 * exercise published through 6.5 the award is opened, sent and issued only once the exercise is
 * Evaluated, its report issued and standing, and the awardee the recommended tenderer, compared as a
 * party. The awarded value and period are pre-filled from the recommendation and may differ, each with
 * its reason. An exercise published before evaluation models existed is told its real exit.
 *
 * Worked example (a finance officer can check it by hand): the recommendation is RM 1,180,000.00 over
 * 18 months. An award at RM 1,150,000.00 over 18 months differs in its value only, so it asks one
 * reason, for the value; at RM 1,180,000.00 over 20 months it asks one, for the period.
 */

const issued = { stale: false, recommendedPartyId: "p1", price: parseSen("1180000.00"), period: { value: 18, unit: "MONTHS" as const } };
const facts = (over: Partial<EvaluationGateFacts> = {}): EvaluationGateFacts => ({ applies: true, pinned: true, exerciseStatus: "EVALUATED", issued, ...over });
const award = (value = "1180000.00", months = 18, reasons: { value: string | null; period: string | null } = { value: null, period: null }) => ({ value: parseSen(value), period: { value: months, unit: "MONTHS" as const }, reasons });
const codes = (e: EvaluationForAward | null) => evaluationFindings(e).map((f) => f.code);

describe("the exercise is open past the opening; the evaluation's gate decides the rest", () => {
  const closed = { phase: "CLOSED" as const, changePending: false };
  it.each(["OPENED", "UNDER_EVALUATION", "EVALUATED"])("%s, window closed: open here", (s) => {
    expect(exerciseOpenForAward(s, "TENDER", closed)).toBe(true);
    expect(exerciseOpenForAward(s, "QUOTATION", { phase: "CLOSED", changePending: true })).toBe(false);
  });
  it("before the opening is finalised, the refusal still names the opening", () => {
    expect(awardOpenRefusal("TENDER", "OPENING_IN_PROGRESS", closed)).toMatch(/Bids and opening/);
  });
});

describe("the evaluation's gate (evaluationFindings)", () => {
  it("not published through 6.5, or none given: nothing asked", () => {
    expect(codes(null)).toEqual([]);
    expect(codes({ facts: facts({ applies: false, pinned: false, exerciseStatus: "DOCUMENTS_IN_PREPARATION", issued: null }), awardeePartyId: null })).toEqual([]);
  });
  it("published before models existed: NEVER_EVALUATED alone, naming cancel and replace", () => {
    expect(codes({ facts: facts({ pinned: false, exerciseStatus: "OPENED", issued: null }), awardeePartyId: "p1" })).toEqual(["NEVER_EVALUATED"]);
    expect(awardFindingText({ code: "NEVER_EVALUATED", level: "block" })).toMatch(/cancel it/);
  });
  it("Opened or Under evaluation: NOT_EVALUATED", () => {
    expect(codes({ facts: facts({ exerciseStatus: "OPENED", issued: null }), awardeePartyId: "p1" })).toEqual(["NOT_EVALUATED"]);
    expect(codes({ facts: facts({ exerciseStatus: "UNDER_EVALUATION", issued: null }), awardeePartyId: "p1" })).toEqual(["NOT_EVALUATED"]);
  });
  it("Evaluated with no issued report in force (a version reopened): NOT_EVALUATED", () => {
    expect(codes({ facts: facts({ issued: null }), awardeePartyId: "p1" })).toEqual(["NOT_EVALUATED"]);
  });
  it("the report no longer stands (a late tender opened since): REPORT_STALE", () => {
    expect(codes({ facts: facts({ issued: { ...issued, stale: true } }), awardeePartyId: "p1" })).toEqual(["REPORT_STALE"]);
  });
  it("the awardee is the recommended party, compared as a party; not named yet is not asked", () => {
    expect(codes({ facts: facts(), awardeePartyId: "p1" })).toEqual([]);
    expect(codes({ facts: facts(), awardeePartyId: "p2" })).toEqual(["AWARDEE_NOT_RECOMMENDED"]);
    expect(codes({ facts: facts(), awardeePartyId: null })).toEqual(["AWARDEE_NOT_RECOMMENDED"]);
  });
  it("the worked example: each figure that differs asks its own reason, and a reason given clears it", () => {
    expect(codes({ facts: facts(), awardeePartyId: "p1", award: award() })).toEqual([]);
    expect(codes({ facts: facts(), awardeePartyId: "p1", award: award("1150000.00") })).toEqual(["VALUE_DIFFERS_REASON_REQUIRED"]);
    expect(codes({ facts: facts(), awardeePartyId: "p1", award: award("1180000.00", 20) })).toEqual(["PERIOD_DIFFERS_REASON_REQUIRED"]);
    expect(codes({ facts: facts(), awardeePartyId: "p1", award: award("1150000.00", 20) })).toEqual(["VALUE_DIFFERS_REASON_REQUIRED", "PERIOD_DIFFERS_REASON_REQUIRED"]);
    expect(codes({ facts: facts(), awardeePartyId: "p1", award: award("1150000.00", 20, { value: "Negotiated down by the Board", period: "Phasing agreed" }) })).toEqual([]);
    expect(codes({ facts: facts(), awardeePartyId: "p1", award: award("1150000.00", 18, { value: "   ", period: null }) })).toEqual(["VALUE_DIFFERS_REASON_REQUIRED"]);
  });
  it("one sen off the recommendation is a difference (exact, never rounded)", () => {
    expect(codes({ facts: facts(), awardeePartyId: "p1", award: award("1179999.99") })).toEqual(["VALUE_DIFFERS_REASON_REQUIRED"]);
  });
  it("a recommendation that states no period: any period differs", () => {
    expect(codes({ facts: facts({ issued: { ...issued, period: null } }), awardeePartyId: "p1", award: award() })).toEqual(["PERIOD_DIFFERS_REASON_REQUIRED"]);
  });
  it("every code reads in words through the award's labels", () => {
    for (const code of ["NEVER_EVALUATED", "NOT_EVALUATED", "REPORT_STALE", "AWARDEE_NOT_RECOMMENDED", "VALUE_DIFFERS_REASON_REQUIRED", "PERIOD_DIFFERS_REASON_REQUIRED"]) {
      expect(awardFindingText({ code, level: "block" })).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    }
  });
});

describe("submission and issue ask it", () => {
  const route = { ok: true as const, ruleKey: "k", ruleLabel: "l", clause: null, approverCode: "CEO", committeeCode: null, chain: [], warnings: [], source: "DAL" as const, overrideIssue: null, core: null } as unknown as Parameters<typeof submitFaults>[0]["route"];
  const sub = (status: string, e: EvaluationForAward | null) => submitFaults({ status: "DRAFT", today: "2026-11-30", exerciseStatus: status, exercisePackKind: "TENDER", exerciseWindow: { phase: "CLOSED", changePending: false }, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route, opening: null, evaluation: e }).map((f) => f.code);
  it("submission: an Opened exercise is refused NOT_EVALUATED; Evaluated with the recommended party passes", () => {
    expect(sub("OPENED", { facts: facts({ exerciseStatus: "OPENED", issued: null }), awardeePartyId: "p1" })).toEqual(["NOT_EVALUATED"]);
    expect(sub("EVALUATED", { facts: facts(), awardeePartyId: "p1", award: award() })).toEqual([]);
    expect(sub("EVALUATED", { facts: facts(), awardeePartyId: "p1", award: award("1150000.00") })).toEqual(["VALUE_DIFFERS_REASON_REQUIRED"]);
  });
  const clear: IssueInput = {
    status: "APPROVED",
    opening: null,
    today: "2026-11-30",
    exerciseStatus: "EVALUATED",
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
  it("issue: the report gone stale since approval holds the instrument back", () => {
    expect(issueFaults({ ...clear, evaluation: { facts: facts(), awardeePartyId: "p1", award: award() } }).map((f) => f.code)).toEqual([]);
    expect(issueFaults({ ...clear, evaluation: { facts: facts({ issued: { ...issued, stale: true } }), awardeePartyId: "p1", award: award() } }).map((f) => f.code)).toEqual(["REPORT_STALE"]);
  });
});
