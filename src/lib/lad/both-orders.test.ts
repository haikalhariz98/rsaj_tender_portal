import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import { matterSigning } from "@/lib/matter/matter";
import { issueMovedFaults } from "@/lib/time/extension";
import { periodMovedFaults } from "@/lib/time/period";

import { decisionBasisFaults } from "./basis";
import { ladBasisMoved, type LadBasis } from "./frozen";
import { ladLines, type LadLinesInput, type ScopeDecision } from "./scopes";
import { rateSegments, segmentsKey } from "./segments";
import { applicationOf, ladAmountAt } from "./waiver";

/**
 * 6.13 Part B run 1b: the conflicting pairs of plan B6 that run 1b's acts reach, each in both orders (design note §8).
 * The acts call these rules on their locked rows; the verify cases (phase B) run the same pairs through the acts.
 */

const R = parseSen("269.38");
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const issuedLine = { certificateId: "i1", number: "IP/1", scopeKey: "WHOLE", segments: [{ from: "2026-09-01", until: "2026-10-01", rate: R, days: 30 }], gross: parseSen("8081.40"), rounding: 0n };
const decision = (o: Partial<ScopeDecision> = {}): ScopeDecision => ({ id: "d1", outcome: "LAD_APPLIES", reason: "", certificateIssued: true, from: "2026-09-01", until: null, rate: R, dateForCompletion: "2026-08-31", superseded: null, occupation: null, ...o });
const lines = (o: Partial<LadLinesInput> = {}) => ladLines({ valuationDate: "2026-09-30", wholeDate: "2026-08-31", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-08-31", decision: decision() }], issued: [], returned: [], waiversApplied: [], waiversToApply: [], ...o });
const basis = (o: Partial<LadBasis> = {}): LadBasis => ({ decisions: [{ key: "WHOLE", id: "d1", supersededBy: null }], extensions: [], waiversApproved: [], waiversApplied: [], scopeDates: { WHOLE: "2026-08-31" }, segments: { WHOLE: segmentsKey(rateSegments(R, null)) }, ...o });
const names = { extension: () => "EOT/1", waiver: () => "CM/2", scope: () => "the whole works" };

describe("EOT issue / interim", () => {
  it("EOT first: the valuation after reads the new version: past the new date refused until a replacement; on or before it nothing charged, nothing asked, the credit returned", () => {
    const sup = decision({ superseded: { eotNumber: "EOT/1", newDate: "2026-09-14" } });
    expect(codes(lines({ valuationDate: "2026-10-31", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-09-14", decision: sup }], issued: [issuedLine] }).faults)).toEqual(["NON_COMPLETION_SUPERSEDED"]);
    const on = lines({ valuationDate: "2026-09-14", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-09-14", decision: sup }], issued: [issuedLine] });
    expect(on.faults).toEqual([]);
    expect(on.total.credit).toBe(parseSen("3771.32"));
  });
  it("interim first: its issue refused LAD_BASIS_MOVED, naming the EOT", () => {
    const f = ladBasisMoved(basis(), basis({ extensions: ["e1"] }), names);
    expect(codes(f)).toEqual(["LAD_BASIS_MOVED"]);
    expect(String(f[0].data?.moved)).toMatch(/EOT\/1/);
  });
});

describe("waiver approved / interim", () => {
  const frozen = { amount: parseSen("8081.40"), extensions: [], supersededBy: null, segments: "269.38" };
  it("waiver first: the next raise applies it (NEXT_CERTIFICATE)", () => {
    expect(applicationOf({ setting: "NEXT_CERTIFICATE", approved: true, applied: false, frozen, now: frozen })).toEqual({ state: "APPLY" });
    expect(lines({ waiversToApply: [{ id: "w1", scopeKey: "WHOLE", amount: parseSen("2020.35"), label: "CM/2" }] }).total.amount).toBe(parseSen("6061.05"));
  });
  it("interim first: its issue refused LAD_BASIS_MOVED, naming the waiver", () => {
    expect(ladBasisMoved(basis(), basis({ waiversApproved: ["w1"] }), names).map((f) => f.data?.moved)).toEqual(["the waiver CM/2 was approved"]);
  });
});

describe("waiver sent / EOT issued (BD-613-75)", () => {
  const at = { window: { from: "2026-09-01", until: null }, asOf: "2026-09-30", superseded: null, charged: [], segments: rateSegments(R, null) };
  it("waiver sent first at its frozen amount; the EOT then issues: applying it is refused LAD_BASIS_MOVED, naming the EOT; it is re-sent", () => {
    const sent = ladAmountAt({ ...at, scopeDate: "2026-08-31" });
    const now = ladAmountAt({ ...at, scopeDate: "2026-09-14", superseded: null });
    expect(sent).toBe(parseSen("8081.40"));
    const app = applicationOf({ setting: "NEXT_CERTIFICATE", approved: true, applied: false, frozen: { amount: sent, extensions: [], supersededBy: null, segments: "269.38" }, now: { amount: now, extensions: [{ id: "e1", number: "EOT/1" }], supersededBy: null, segments: "269.38" } });
    expect(app.state).toBe("MOVED");
  });
  it("EOT issued first: the waiver is sent on the moved basis (net of the credit) and applies", () => {
    const amount = ladAmountAt({ ...at, scopeDate: "2026-09-14" });
    expect(amount).toBe(R * 16n);
    const same = { amount, extensions: [{ id: "e1", number: "EOT/1" }], supersededBy: null, segments: "269.38" };
    expect(applicationOf({ setting: "NEXT_CERTIFICATE", approved: true, applied: false, frozen: same, now: same })).toEqual({ state: "APPLY" });
  });
});

describe("credit and waiver on one damages line (BD-613-75)", () => {
  const credited = { lineCertificateId: "i1", lineNumber: "IP/1", scopeKey: "WHOLE", segmentFrom: "2026-09-01", days: 14, rate: R, amount: parseSen("3771.32") };
  it("credit first: a waiver applied after it is refused where credit + waived would pass the damages charged", () => {
    const r = lines({ valuationDate: "2026-09-30", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-09-14", decision: decision({ from: "2026-10-01" }) }], issued: [issuedLine], returned: [credited], waiversToApply: [{ id: "w1", scopeKey: "WHOLE", amount: parseSen("4310.09"), label: "CM/2" }] });
    expect(codes(r.faults)).toEqual(["LAD_WAIVER_OVER_CHARGED"]);
  });
  it("waiver applied first: the credit is refused likewise, naming the line", () => {
    const r = lines({ valuationDate: "2026-09-14", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-09-14", decision: decision({ superseded: { eotNumber: "EOT/1", newDate: "2026-09-14" } }) }], issued: [issuedLine], waiversApplied: [{ scopeKey: "WHOLE", amount: parseSen("4310.09") }] });
    expect(codes(r.faults)).toEqual(["LAD_CREDIT_OVER_CHARGED"]);
    expect(r.faults[0].data).toMatchObject({ line: "the whole works", charged: "8081.40", credited: "3771.32", waived: "4310.09" });
  });
});

describe("CPO confirmed rate / interim (pure: the CPO is run 2's)", () => {
  const CPO = parseSen("215.50");
  it("rate confirmed first: the next interim's segments at the new rate", () => {
    const r = lines({ scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-08-31", decision: decision({ occupation: { occupiedOn: "2026-09-10", confirmedRate: CPO } }) }] });
    expect(r.lines[0].segments.map((s) => [s.rate, s.days])).toEqual([[R, 9], [CPO, 21]]);
  });
  it("interim first: LAD_BASIS_MOVED", () => {
    expect(codes(ladBasisMoved(basis(), basis({ segments: { WHOLE: segmentsKey(rateSegments(R, { occupiedOn: "2026-09-10", confirmedRate: CPO })) } }), names))).toEqual(["LAD_BASIS_MOVED"]);
  });
});

describe("EOT claim open / LAD_APPLIES", () => {
  const open = { id: "c1", reference: "CM/1", scope: "WHOLE" as const, sectionRef: null, entitlement: null, closed: false, certified: false };
  it("claim first: the decision refused EOT_DETERMINATION_OUTSTANDING", () => expect(codes(decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "WHOLE", sectionRef: null, claims: [open], eotClaimId: null }))).toEqual(["EOT_DETERMINATION_OUTSTANDING"]));
  it("decision first: allowed; the claim opened later does not stop the live decision charging until an EOT issues", () => {
    expect(decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "WHOLE", sectionRef: null, claims: [], eotClaimId: null })).toEqual([]);
    expect(lines().lines[0].state).toBe("CHARGED");
  });
  it("NOT_ENTITLED determined (the claim closed): the decision is allowed", () => {
    expect(decisionBasisFaults({ outcome: "LAD_APPLIES", scope: "WHOLE", sectionRef: null, claims: [{ ...open, entitlement: "NOT_ENTITLED", closed: true }], eotClaimId: null })).toEqual([]);
  });
});

describe("two EOT certificates on one scope", () => {
  it("the second raised after the first issued reads its date; raised before, its issue refused EOT_MOVED", () => {
    expect(issueMovedFaults("2026-09-14", "2026-09-14")).toEqual([]);
    expect(codes(issueMovedFaults("2026-08-31", "2026-09-14"))).toEqual(["EOT_MOVED"]);
  });
});

describe("matter approved / the EOT certificate's signing", () => {
  const m = { kind: "EOT" as const, reference: "CM/1", closed: null, seriesSet: true, approvedRouteId: "r1" };
  it("approved first: signs; not yet: refused MATTER_NOT_APPROVED", () => {
    expect(matterSigning("EOT", { ...m, routes: [{ id: "r1", status: "APPROVED" }] })).toEqual([]);
    expect(codes(matterSigning("EOT", { ...m, approvedRouteId: null, routes: [{ id: "r1", status: "PENDING" }] }))).toEqual(["MATTER_NOT_APPROVED"]);
  });
});

describe("two period agreements (Phase 2 close-out, stage A)", () => {
  it("the second raised after the first issued reads its expiry; raised before, its issue refused PERIOD_MOVED", () => {
    expect(periodMovedFaults("2027-03-31", "2027-03-31")).toEqual([]);
    expect(codes(periodMovedFaults("2026-12-31", "2027-03-31"))).toEqual(["PERIOD_MOVED"]);
  });
});
