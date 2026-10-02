import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { aspectPrefill, assessFaults } from "./aspects";
import { evaluationGateFaults, differenceFaults, recommendationDifferences } from "./award-gate";
import { bundleFaults } from "./bundle";
import { consentCheck } from "./consent";
import { bidder, facts, result, submission } from "./fixture";
import { parseFixed } from "./fixed";
import { carryPlan, loopFault, loopKeyState, loopTarget, LOOP_STAGE_KEYS } from "./loop";
import { closeMeetingFaults, negotiationRequestFaults, openMeetingFaults } from "./meetings";
import { chooseFaults, pinFaults } from "./pin";
import { renderFaults, signerFaults } from "./proposal";
import { ranking, recommendationFaults } from "./recommend";
import { annexLabels, PRODUCT_ANNEX_LABELS, reportFaults, reportStale } from "./report";
import { rankByPrice, shortlistFaults } from "./shortlist";
import { evaluationPhase, issuedActFaults, openActFaults } from "./state";
import { startFaults } from "./start";

/**
 * The rest of the evaluation's rules (plan §3: shortlist, aspects, meetings, recommend, report,
 * consent, bundle, proposal, loop, the award gate, pin, start, state). Each test fails if its rule is
 * removed; the spec's examples are named where they apply.
 */

const codes = (fs: { code: string; level?: string }[]) => fs.filter((f) => f.level !== "warn" && f.level !== "info").map((f) => f.code);
const warns = (fs: { code: string; level?: string }[]) => fs.filter((f) => f.level === "warn").map((f) => f.code);
const RM = parseSen;

describe("shortlist.ts (FR-EVL-009)", () => {
  const five = [1, 2, 3, 4, 5].map((n) => ({ id: `b${n}`, price: RM(String(100000 + n * 1000)) }));
  const base = { rule: "COUNT_RANGE" as const, min: 3, max: 4, officeCode: null };
  it("COUNT_RANGE 3–4 with five eligible: two chosen is too few, five too many, three or four pass", () => {
    expect(codes(shortlistFaults({ ...base, eligible: five, chosen: ["b1", "b2"] }))).toEqual(["TOO_FEW"]);
    expect(codes(shortlistFaults({ ...base, eligible: five, chosen: ["b1", "b2", "b3", "b4", "b5"] }))).toEqual(["TOO_MANY"]);
    expect(codes(shortlistFaults({ ...base, eligible: five, chosen: ["b1", "b2", "b3"] }))).toEqual([]);
  });
  it("two eligible: both, flagged FEWER_THAN_MINIMUM, never padded", () => {
    const f = shortlistFaults({ ...base, eligible: five.slice(0, 2), chosen: ["b1", "b2"] });
    expect(codes(f)).toEqual([]);
    expect(warns(f)).toEqual(["FEWER_THAN_MINIMUM"]);
    expect(codes(shortlistFaults({ ...base, eligible: five.slice(0, 2), chosen: ["b1"] }))).toEqual(["TOO_FEW"]);
  });
  it("DECIDED_BY_OFFICE: the decider holds the office on the day", () => {
    const d = { rule: "DECIDED_BY_OFFICE" as const, min: null, max: null, officeCode: "HOD", eligible: five, chosen: ["b1"] };
    expect(codes(shortlistFaults({ ...d, deciderHoldsOffice: false }))).toEqual(["NOT_OFFICE_HOLDER"]);
    expect(codes(shortlistFaults({ ...d, deciderHoldsOffice: true }))).toEqual([]);
  });
  it("ranked by price ascending, ties kept together; a tie split at the cut is said", () => {
    const tied = [{ id: "a", price: RM("10") }, { id: "b", price: RM("20") }, { id: "c", price: RM("20") }, { id: "d", price: RM("30") }];
    expect(rankByPrice(tied).map((x) => x.rank)).toEqual([1, 2, 2, 4]);
    expect(warns(shortlistFaults({ rule: "COUNT_RANGE", min: 1, max: 2, officeCode: null, eligible: tied, chosen: ["a", "b"] }))).toEqual(["TIE_SPLIT"]);
  });
  it("only an eligible bid; the rule unset is not guessed", () => {
    expect(codes(shortlistFaults({ ...base, eligible: five, chosen: ["b1", "b2", "zz"] }))).toEqual(["NOT_ELIGIBLE", "TOO_FEW"]);
    expect(codes(shortlistFaults({ ...base, rule: null, eligible: five, chosen: [] }))).toEqual(["SHORTLIST_UNSET"]);
  });
});

describe("aspects.ts (FR-EVL-003)", () => {
  it("(a) is prefilled from the opening's completeness, editable", () => {
    expect(aspectPrefill("COMPLETENESS", { missingAtOpening: ["Form of tender"], priceAsRead: 1n, correctedPrice: null }, { sealed: true })).toEqual({ verdict: "NOT_SATISFACTORY", narrative: "At the opening the bid was found without: Form of tender." });
    expect(aspectPrefill("COMPLETENESS", { missingAtOpening: [], priceAsRead: 1n, correctedPrice: null }, { sealed: true }).verdict).toBe("SATISFACTORY");
  });
  it("(b) shows the computed variance and suggests no verdict", () => {
    const s = aspectPrefill("PRICE_VS_ESTIMATE", { missingAtOpening: [], priceAsRead: RM("280500.00"), correctedPrice: null }, { value: RM("330000.00"), label: null });
    expect(s).toEqual({ verdict: null, narrative: "The evaluated price is −15.00% against the company estimate." });
  });
  it("a verdict needs its narrative", () => {
    expect(codes(assessFaults({ aspectInModel: true, verdict: "SATISFACTORY", narrative: " " }))).toEqual(["NARRATIVE_REQUIRED"]);
    expect(codes(assessFaults({ aspectInModel: false, verdict: null, narrative: "x" }))).toEqual(["ASPECT_NOT_IN_MODEL", "VERDICT_REQUIRED"]);
  });
  it("aspect (c) unassessed holds the stage: ASPECT_UNASSESSED (the FR-EVL-003 acceptance)", async () => {
    const { stageResult } = await import("./stages");
    const { stageOf } = await import("./model");
    const f = facts({ submissions: [submission("COMPLIANCE", "CONTRACT_PROCUREMENT")], bidders: [bidder(1, { aspects: new Map([["A", { verdict: "SATISFACTORY", narrative: "x" }], ["B", { verdict: "SATISFACTORY", narrative: "x" }], ["D", { verdict: "SATISFACTORY", narrative: "x" }]]) })] });
    const r = stageResult(f, stageOf(f.model, "ASPECTS")!, f.bidders[0]);
    expect(r.faults.map((x) => [x.code, x.data?.aspect])).toEqual([["ASPECT_UNASSESSED", "The completion period"]]);
  });
});

describe("meetings.ts (FR-EVL-015, 016)", () => {
  const open = { kind: "CLARIFICATION" as const, bidderInRunning: true, route: null, openAlready: false, heldOn: "2026-10-01", startedOn: "2026-09-30", today: "2026-10-02", place: "Room 1", personActive: true };
  it("a clarification is open to any bidder in the running", () => {
    expect(openMeetingFaults(open)).toEqual([]);
    expect(codes(openMeetingFaults({ ...open, bidderInRunning: false }))).toEqual(["NOT_IN_RUNNING"]);
    expect(codes(openMeetingFaults({ ...open, heldOn: "2026-10-03" }))).toEqual(["HELD_IN_FUTURE"]);
  });
  it("a negotiation needs its APPROVED route on the negotiation domain", () => {
    expect(codes(openMeetingFaults({ ...open, kind: "NEGOTIATION" }))).toEqual(["NEGOTIATION_NOT_REQUESTED"]);
    expect(codes(openMeetingFaults({ ...open, kind: "NEGOTIATION", route: { status: "PENDING" } }))).toEqual(["NEGOTIATION_NOT_AUTHORISED"]);
    expect(codes(openMeetingFaults({ ...open, kind: "NEGOTIATION", route: { status: "REJECTED" } }))).toEqual(["NEGOTIATION_REFUSED"]);
    expect(openMeetingFaults({ ...open, kind: "NEGOTIATION", route: { status: "APPROVED" } })).toEqual([]);
  });
  it("no route rows: refused naming the Approval matrix (RULE_NOT_SET)", () => {
    const n = { bidderInRunning: true, reason: "Price above the estimate", pending: false, routeState: "NO_RULE" as const, personActive: true, today: "2026-10-02" };
    expect(codes(negotiationRequestFaults(n))).toEqual(["RULE_NOT_SET"]);
    expect(codes(negotiationRequestFaults({ ...n, routeState: "HAS_COMMITTEE_STEP" }))).toEqual(["HAS_COMMITTEE_STEP"]);
    expect(negotiationRequestFaults({ ...n, routeState: "RESOLVED" })).toEqual([]);
  });
  it("closing needs the minutes and a live confirmation; a negotiation round its two prices; closed, frozen", () => {
    const c = { kind: "CLARIFICATION" as const, closed: false, minutes: "Agreed the programme.", liveConfirmations: 1, priceBefore: null, priceAfter: null, personActive: true };
    expect(closeMeetingFaults(c)).toEqual([]);
    expect(codes(closeMeetingFaults({ ...c, minutes: "" }))).toEqual(["MINUTES_REQUIRED"]);
    expect(codes(closeMeetingFaults({ ...c, liveConfirmations: 0 }))).toEqual(["CONFIRMATION_REQUIRED"]);
    expect(codes(closeMeetingFaults({ ...c, kind: "NEGOTIATION" }))).toEqual(["PRICES_REQUIRED"]);
    expect(warns(closeMeetingFaults({ ...c, kind: "NEGOTIATION", priceBefore: 10n, priceAfter: 11n }))).toEqual(["PRICE_RAISED"]);
    expect(codes(closeMeetingFaults({ ...c, closed: true }))).toEqual(["MEETING_CLOSED"]);
  });
});

describe("recommend.ts (FR-EVL-004, OD-6 A)", () => {
  const all = ["COMPLIANCE", "ASPECTS", "TECHNICAL", "FINANCIAL", "COMPOSITE"];
  const ok: { verdict: "SATISFACTORY" | "NOT_SATISFACTORY"; narrative: string } = { verdict: "SATISFACTORY", narrative: "x" };
  const done = (b2Aspect = ok, over = {}) =>
    facts({
      submissions: all.map((s) => submission(s)),
      results: [result("b1", "COMPOSITE", { shown: parseFixed("85.01") }), result("b2", "COMPOSITE", { shown: parseFixed("80.00") })],
      bidders: [bidder(1, { aspects: new Map([["B", ok]]) }), bidder(2, { aspects: new Map([["B", b2Aspect]]) })],
      ...over,
    });
  const rec = (f: ReturnType<typeof facts>, bidderId: string, justification = "") => recommendationFaults(f, { bidderId, justification, personActive: true, alreadyFormed: false, meetingsOpen: 0 });
  it("ranked by the composite; the top-ranked is recommended without a justification", () => {
    expect(ranking(done()).map((r) => [r.bidder.id, r.rank])).toEqual([["b1", 1], ["b2", 2]]);
    expect(rec(done(), "b1")).toEqual({ faults: [], topRanked: true });
  });
  it("not the top-ranked: JUSTIFICATION_REQUIRED, met by one", () => {
    expect(codes(rec(done(), "b2").faults)).toEqual(["JUSTIFICATION_REQUIRED"]);
    expect(rec(done(), "b2", "The first-ranked cannot meet the programme.").faults).toEqual([]);
  });
  it("aspect (b) NOT_SATISFACTORY refuses; unassessed refuses", () => {
    expect(codes(rec(done({ verdict: "NOT_SATISFACTORY", narrative: "x" }), "b2", "j").faults)).toEqual(["PRICE_NOT_REASONABLE"]);
  });
  it("out of the running, or stages incomplete, refused", () => {
    const f = done(ok, { results: [result("b1", "COMPOSITE", { shown: parseFixed("85.01") }), result("b2", "COMPOSITE", { outOfRunning: true, passed: false })] });
    expect(codes(rec(f, "b2", "j").faults)).toEqual(["NOT_IN_RUNNING"]);
    expect(codes(rec(facts(), "b1").faults)).toContain("STAGES_NOT_COMPLETE");
  });
});

describe("report.ts (FR-EVL-017)", () => {
  const ok = { stagesIncomplete: [], recommended: true, openMeetings: 0, pendingNegotiations: 0, seriesKey: "evaluation_report", template: { state: "OK" as const, missing: [], unknown: [] }, admittedUnopened: 0, supplementaryInProgress: false, consent: [], stale: false, personActive: true, today: "2026-10-02" };
  it("each gap is named", () => {
    expect(reportFaults(ok)).toEqual([]);
    expect(codes(reportFaults({ ...ok, stagesIncomplete: ["Technical"] }))).toEqual(["STAGES_NOT_COMPLETE"]);
    expect(codes(reportFaults({ ...ok, recommended: false }))).toEqual(["RECOMMENDATION_MISSING"]);
    expect(codes(reportFaults({ ...ok, openMeetings: 1 }))).toEqual(["MEETING_OPEN"]);
    expect(codes(reportFaults({ ...ok, seriesKey: null }))).toEqual(["SERIES_NOT_SET"]);
    expect(codes(reportFaults({ ...ok, template: { state: "NOT_SET", missing: [], unknown: [] } }))).toEqual(["TEMPLATE_NOT_SET"]);
    expect(codes(reportFaults({ ...ok, admittedUnopened: 1 }))).toEqual(["ADMITTED_UNOPENED"]);
    expect(codes(reportFaults({ ...ok, stale: true }))).toEqual(["REPORT_STALE"]);
    expect(codes(reportFaults({ ...ok, consent: [{ code: "CONSENT_NOT_FROM_RECOMMENDED", level: "block" }] }))).toEqual(["CONSENT_NOT_FROM_RECOMMENDED"]);
  });
  it("stale when the bidders evaluated are not 6.7's carried offers now", () => {
    expect(reportStale(["a", "b"], ["b", "a"])).toBe(false);
    expect(reportStale(["a", "b"], ["a", "b", "c"])).toBe(true);
  });
  it("annex labels: configured where set, the product's English where not, in order A–F", () => {
    const l = annexLabels({ A: { en: "Lampiran A: Markah", ms: "Markah" } });
    expect(l.A).toEqual({ en: "Lampiran A: Markah", ms: "Markah", configured: true });
    expect(l.F).toEqual({ en: PRODUCT_ANNEX_LABELS.F, ms: null, configured: false });
    expect(Object.keys(l)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});

describe("consent.ts (6.6 OD-7, FR-BID-010)", () => {
  it("consent from party P, recommendation Q: CONSENT_NOT_FROM_RECOMMENDED; from Q: CHECKED", () => {
    const x = (party: string) => [{ id: "x1", consentPartyId: party, consentPartyName: party, applied: true, toExpiry: "2026-12-01" }];
    expect(consentCheck(x("P"), "Q").rows[0].outcome).toBe("CONSENT_NOT_FROM_RECOMMENDED");
    expect(codes(consentCheck(x("P"), "Q").faults)).toEqual(["CONSENT_NOT_FROM_RECOMMENDED"]);
    expect(consentCheck(x("Q"), "Q")).toEqual({ rows: [{ extensionId: "x1", toExpiry: "2026-12-01", consentPartyName: "Q", outcome: "CHECKED" }], faults: [] });
    expect(consentCheck([{ ...x("P")[0], applied: false }], "Q")).toEqual({ rows: [], faults: [] });
  });
});

describe("bundle.ts and proposal.ts (FR-CTE-007, 013)", () => {
  it("tabling the appointment without an issued report: REPORT_NOT_ISSUED; stale: REPORT_STALE; the paper checked and recommended", () => {
    expect(bundleFaults({ applies: false, evaluation: null, proposal: null })).toEqual([]);
    expect(codes(bundleFaults({ applies: true, evaluation: null, proposal: null }))).toEqual(["EVALUATION_NOT_STARTED"]);
    expect(codes(bundleFaults({ applies: true, evaluation: { state: "OPEN", stale: false }, proposal: null }))).toEqual(["REPORT_NOT_ISSUED"]);
    expect(codes(bundleFaults({ applies: true, evaluation: { state: "ISSUED", stale: true }, proposal: { checked: true, recommended: true } }))).toEqual(["REPORT_STALE"]);
    expect(codes(bundleFaults({ applies: true, evaluation: { state: "ISSUED", stale: false }, proposal: { checked: true, recommended: false } }))).toEqual(["PROPOSAL_NOT_RECOMMENDED"]);
    expect(bundleFaults({ applies: true, evaluation: { state: "ISSUED", stale: false }, proposal: { checked: true, recommended: true } })).toEqual([]);
  });
  it("the checker is not the recommender; each holds the office on the day; unset offices are named", () => {
    const s = { rendered: true, already: false, personId: "a", personActive: true, otherSignerId: null, holdsOffice: true, day: "2026-10-02", today: "2026-10-02", paperDay: "2026-10-01" };
    expect(signerFaults(s)).toEqual([]);
    expect(codes(signerFaults({ ...s, otherSignerId: "a" }))).toEqual(["SAME_PERSON"]);
    expect(codes(signerFaults({ ...s, holdsOffice: false }))).toEqual(["NOT_OFFICE_HOLDER"]);
    expect(codes(signerFaults({ ...s, day: "2026-09-30" }))).toEqual(["DAY_BEFORE_PAPER"]);
    expect(codes(renderFaults({ rendered: false, checkerRoleCode: null, recommenderRoleCode: "R", template: { state: "OK", missing: [], unknown: [] }, personActive: true }))).toEqual(["CHECKER_NOT_SET"]);
  });
});

describe("loop.ts (FR-CTE-009, E-8)", () => {
  it("the three keys map to their re-entry; an unknown key opens nothing; TERMINAL never reopens", () => {
    expect(LOOP_STAGE_KEYS).toEqual(["evaluation.recall", "evaluation.clarification", "evaluation.negotiation"]);
    expect(loopTarget("evaluation.recall")).toEqual({ reEntry: "FIRST_STAGE" });
    expect(loopTarget("evaluation.negotiation")).toEqual({ reEntry: "MEETINGS", meeting: "NEGOTIATION" });
    expect(loopTarget("stage two")).toBeNull();
    expect(loopFault({ kind: "LOOP", key: "evaluation.clarification" })).toBeNull();
    expect(loopFault({ kind: "LOOP", key: "re-tender" })?.code).toBe("LOOP_TARGET_UNKNOWN");
    expect(loopFault({ kind: "TERMINAL", key: "evaluation.recall" })?.code).toBe("TERMINAL_NEVER_REOPENS");
    expect(loopKeyState("LOOP", "free text")).toBe("LEGACY");
    expect(loopKeyState("LOOP", null)).toBe("NONE");
  });
  it("unchanged bidders carry; a new one is fresh (E-7)", () => {
    const p = carryPlan([{ id: "e1", openedBidId: "o1" }, { id: "e2", openedBidId: "o2" }], [{ openedBidId: "o1" }, { openedBidId: "o2" }, { openedBidId: "o3" }]);
    expect(p.carried.map((c) => c.from.id)).toEqual(["e1", "e2"]);
    expect(p.fresh).toEqual(["o3"]);
  });
});

describe("pin.ts (FR-EVL-005, 006; E-1, E-2)", () => {
  const issued = { status: "ISSUED" as const, route: "TRADITIONAL" as const, name: "Model" };
  const basis = { name: "Lump sum", route: "TRADITIONAL" as const };
  it("publication pins an issued model of the basis's route", () => {
    expect(pinFaults({ model: issued, basis, pinned: false })).toEqual([]);
    expect(codes(pinFaults({ model: null, basis, pinned: false }))).toEqual(["MODEL_NOT_SET"]);
    expect(codes(pinFaults({ model: { ...issued, status: "DRAFT" }, basis, pinned: false }))).toEqual(["MODEL_NOT_ISSUED"]);
    expect(codes(pinFaults({ model: issued, basis: { ...basis, route: null }, pinned: false }))).toEqual(["ROUTE_NOT_SET"]);
    expect(codes(pinFaults({ model: { ...issued, route: "TWO_STAGE" }, basis, pinned: false }))).toEqual(["ROUTE_MISMATCH"]);
    expect(codes(pinFaults({ model: issued, basis, pinned: true }))).toEqual(["PINNED"]);
  });
  it("the model is chosen only while unpublished", () => {
    expect(codes(chooseFaults({ published: true, cancelled: false, model: issued }))).toEqual(["ALREADY_PUBLISHED"]);
    expect(chooseFaults({ published: false, cancelled: false, model: issued })).toEqual([]);
  });
});

describe("start.ts and state.ts", () => {
  const main = { kind: "MAIN" as const, sequenceNo: 1, finalised: true, liveScans: 1, copyCheck: "MATCH" as const, explained: false, admittedEnvelopeId: null };
  const s = { status: "OPENED", throughWindow: true, pinned: true, openings: [main], decimals: 2, boundaryMissing: false, carried: 3, started: false, timeZone: "Asia/Kuala_Lumpur", personActive: true };
  it("starts once Opened, its scan attached, the copy explained, a model pinned and the places set", () => {
    expect(startFaults(s)).toEqual([]);
    expect(codes(startFaults({ ...s, pinned: false }))).toEqual(["MODEL_NOT_PINNED"]);
    expect(codes(startFaults({ ...s, openings: [{ ...main, liveScans: 0 }] }))).toEqual(["SIGNED_SCHEDULE_NOT_ATTACHED"]);
    expect(codes(startFaults({ ...s, openings: [{ ...main, copyCheck: "MISMATCH" }] }))).toEqual(["ESTIMATE_COPY_UNEXPLAINED"]);
    expect(codes(startFaults({ ...s, decimals: null }))).toEqual(["DECIMALS_NOT_SET"]);
    expect(codes(startFaults({ ...s, status: "CANCELLED" }))).toEqual(["CANCELLED"]);
    expect(codes(startFaults({ ...s, openings: [main, { ...main, kind: "SUPPLEMENTARY", sequenceNo: 2, finalised: false }] }))).toEqual(["SUPPLEMENTARY_IN_PROGRESS"]);
    expect(codes(startFaults({ ...s, boundaryMissing: true }))).toEqual(["BOUNDARY_NOT_RECORDED"]);
  });
  it("every act refuses on a cancelled exercise first", () => {
    expect(codes(openActFaults({ exerciseStatus: "CANCELLED", state: "OPEN" }))).toEqual(["CANCELLED"]);
    expect(codes(openActFaults({ exerciseStatus: "UNDER_EVALUATION", state: "ISSUED" }))).toEqual(["REPORT_ISSUED"]);
    expect(codes(issuedActFaults({ exerciseStatus: "EVALUATED", state: "OPEN" }))).toEqual(["REPORT_NOT_ISSUED"]);
    expect(openActFaults({ exerciseStatus: "UNDER_EVALUATION", state: "OPEN" })).toEqual([]);
  });
  it("the derived states (OD-3 A)", () => {
    expect(evaluationPhase({ exerciseStatus: "UNDER_EVALUATION", state: "OPEN", openMeetings: ["CLARIFICATION"], appointment: null })).toBe("CLARIFICATION");
    expect(evaluationPhase({ exerciseStatus: "EVALUATED", state: "ISSUED", openMeetings: [], appointment: "PENDING" })).toBe("PENDING_COMMITTEE");
    expect(evaluationPhase({ exerciseStatus: "EVALUATED", state: "ISSUED", openMeetings: [], appointment: "NOT_CARRIED" })).toBe("NOT_APPROVED");
  });
});

describe("award-gate.ts (E-9, OD-8 A)", () => {
  const issued = { stale: false, recommendedPartyId: "p1", price: RM("297000.00"), period: { value: 12, unit: "MONTHS" as const } };
  const g = { applies: true, pinned: true, exerciseStatus: "EVALUATED", issued };
  it("EVALUATED, an issued report still standing, the awardee the recommended party", () => {
    expect(evaluationGateFaults(g, "p1")).toEqual([]);
    expect(codes(evaluationGateFaults(g, "p2"))).toEqual(["AWARDEE_NOT_RECOMMENDED"]);
    expect(codes(evaluationGateFaults({ ...g, exerciseStatus: "UNDER_EVALUATION" }, "p1"))).toEqual(["NOT_EVALUATED"]);
    expect(codes(evaluationGateFaults({ ...g, issued: { ...issued, stale: true } }, "p1"))).toEqual(["REPORT_STALE"]);
    expect(codes(evaluationGateFaults({ ...g, pinned: false }))).toEqual(["NEVER_EVALUATED"]);
    expect(evaluationGateFaults({ ...g, applies: false }, "zz")).toEqual([]);
  });
  it("the value and period may differ, each with its reason", () => {
    const d = recommendationDifferences({ value: RM("290000.00"), period: { value: 12, unit: "MONTHS" } }, { price: issued.price, period: issued.period });
    expect(d).toEqual(["value"]);
    expect(codes(differenceFaults(d, { value: null, period: null }))).toEqual(["VALUE_DIFFERS_REASON_REQUIRED"]);
    expect(differenceFaults(d, { value: "Negotiated by the Board", period: null })).toEqual([]);
    expect(recommendationDifferences({ value: issued.price, period: { value: 10, unit: "MONTHS" } }, issued)).toEqual(["period"]);
  });
});

describe("stage-one.ts (FR-EVL-005)", () => {
  it("one matter per bidder, at a sitting of the first stage's committee; decided, it stands; deferred, it is tabled again", async () => {
    const { stageOneTablingFaults } = await import("./stage-one");
    const ok = { twoStage: true, committeeCode: "TB", sitting: { committeeCode: "TB", frozen: false }, excluded: false, matters: [] as ("PENDING" | "CARRIED" | "NOT_CARRIED" | "DEFERRED")[] };
    expect(stageOneTablingFaults(ok)).toEqual([]);
    expect(codes(stageOneTablingFaults({ ...ok, twoStage: false }))).toEqual(["NOT_TWO_STAGE"]);
    expect(codes(stageOneTablingFaults({ ...ok, sitting: { committeeCode: "QC", frozen: false } }))).toEqual(["OTHER_COMMITTEE"]);
    expect(codes(stageOneTablingFaults({ ...ok, matters: ["PENDING"] }))).toEqual(["STAGE_ONE_TABLED"]);
    expect(codes(stageOneTablingFaults({ ...ok, matters: ["NOT_CARRIED"] }))).toEqual(["STAGE_ONE_DECIDED"]);
    expect(stageOneTablingFaults({ ...ok, matters: ["DEFERRED"] })).toEqual([]);
  });
});
