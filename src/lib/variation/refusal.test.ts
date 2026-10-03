import { describe, expect, it } from "vitest";

import { rejectionOutcome } from "@/lib/authority/rejection";
import { parseSen } from "@/lib/money";

import { approvedValue, cumulativeApproved, refusalKinds, standsApproved, type RouteFact, type VariationFacts } from "./application";
import { percentLabel, percentLabelText, variationReading } from "./percent";

/**
 * Run 3 review MUST 1, on the reviewer's figures: contract RM750,000; variation A's prior approval RM90,000 approved and
 * instructed, its order RM100,000, so an increase of RM10,000 is sent and refused with a terminal outcome. A stays open
 * (supported), its RM90,000 stays in the cumulative, and the next RM10,000 variation reads 13.33% (cumulative basis).
 */

const S = parseSen;
const route = (event: RouteFact["event"], status: string, value: string): RouteFact => ({ id: `${event}-${status}`, event, status, value: S(value), applied: null, choices: [], openedOn: "2026-05-01" });
const v = (x: Partial<VariationFacts> = {}): VariationFacts => ({ id: "a", status: "SUPPORTED", exemption: null, estimate: S("90000.00"), soDecision: "SUPPORTED", soDecisionCap: null, routes: [], instructions: [], orders: [], commencedOn: null, ...x });
const A = v({ routes: [route("PRIOR", "APPROVED", "90000.00"), route("INCREASE", "REJECTED", "10000.00")], instructions: [{ id: "i", certificateStatus: "ISSUED" }], orders: [{ id: "o", certificateStatus: "DRAFT", net: S("100000.00") }] });
const steps = [{ sequence: 1, roleCode: "VOC" }, { sequence: 2, roleCode: "CEO" }];

describe("a refused route on a variation that stands approved ends the route only", () => {
  it("A stands approved; its increase's refusal may return it but never end it; its prior approval's may", () => {
    expect(standsApproved(A)).toBe(true);
    expect(refusalKinds(A, "INCREASE")).toEqual(["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP"]);
    expect(refusalKinds(A, "AGREED_RATE")).not.toContain("TERMINATE");
    expect(refusalKinds(v(), "PRIOR")).toContain("TERMINATE");
  });
  it("an exempt variation with a live instruction stands too: its re-measurement's refusal does not end it", () => {
    const r = v({ exemption: "REMEASUREMENT", instructions: [{ id: "i", certificateStatus: "SIGNING" }] });
    expect(refusalKinds(r, "REMEASUREMENT")).not.toContain("TERMINATE");
    expect(refusalKinds(v({ exemption: "REMEASUREMENT" }), "REMEASUREMENT")).toContain("TERMINATE");
  });
  it("a configured TERMINATE is not applied there: the officer chooses among the returns", () => {
    const o = rejectionOutcome({ snapshot: { kind: "TERMINATE", returnToRoleCode: null } as never, committee: null, steps, rejectingSeq: 2, supports: refusalKinds(A, "INCREASE") });
    expect(o).toMatchObject({ choose: ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP"] });
  });
  it("a committee's terminal 'not carried', read as a loop there, returns it to whoever sent it", () => {
    const o = rejectionOutcome({ snapshot: { kind: null, returnToRoleCode: null } as never, committee: { kind: "LOOP" }, steps, rejectingSeq: 1, supports: refusalKinds(A, "INCREASE") });
    expect(o).toMatchObject({ apply: "RETURN_TO_ORIGINATOR" });
  });
  it("A keeps RM90,000 in the cumulative, and the next RM10,000 variation reads 13.33% of RM750,000", () => {
    expect(approvedValue(A)).toBe(S("90000.00"));
    const next = v({ id: "b", estimate: S("10000.00"), routes: [] });
    const cumulative = cumulativeApproved([A, next], "b");
    expect(cumulative).toBe(S("90000.00"));
    const r = variationReading({ basis: "CUMULATIVE", base: "ORIGINAL", original: S("750000.00"), adjustments: [], cumulativeApproved: cumulative, event: "PRIOR", value: S("10000.00") });
    expect(r.ok && percentLabelText(percentLabel(r.ratio, [])).en).toBe("13.33%");
  });
});
