import { describe, expect, it } from "vitest";

import { overrideFaults } from "@/lib/certificate/override";
import { applyOverrides } from "@/lib/certificate/override";
import { parseSen } from "@/lib/money";

import { financeFaults } from "./finance";
import { assembleInterim } from "./assemble";
import { routeValueOf, submitStateFaults } from "./route-state";

/**
 * Sending a certificate for approval (614-C4, FR-PAY-016, OD-A6) and Finance's payment (FR-PAY-019). Pure parts;
 * the acts themselves run in the verify harness against perolehan_verify.
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("whether a certificate may be sent for approval now", () => {
  it("only a kind that routes here, in draft or on its routing sheet", () => {
    expect(codes(submitStateFaults({ domain: null, status: "DRAFT", latest: null }))).toEqual(["KIND_HAS_NO_ROUTE"]);
    expect(codes(submitStateFaults({ domain: "payment", status: "SIGNING", latest: null }))).toEqual(["NOT_ROUTABLE_STATUS"]);
    expect(submitStateFaults({ domain: "payment", status: "DRAFT", latest: null })).toEqual([]);
    expect(submitStateFaults({ domain: "payment", status: "IN_ROUTING", latest: null })).toEqual([]);
  });
  it("never twice: a route waiting or approved; a refusal goes on only where it went back to whoever raised it", () => {
    expect(submitStateFaults({ domain: "payment", status: "DRAFT", latest: { status: "PENDING", applied: null, choices: [] } })[0]).toMatchObject({ code: "ROUTE_ALREADY_OPEN", data: { state: "PENDING" } });
    expect(codes(submitStateFaults({ domain: "payment", status: "DRAFT", latest: { status: "APPROVED", applied: null, choices: [] } }))).toEqual(["ROUTE_ALREADY_OPEN"]);
    expect(codes(submitStateFaults({ domain: "payment", status: "DRAFT", latest: { status: "REJECTED", applied: null, choices: ["RETURN_TO_ORIGINATOR"] } }))).toEqual(["ROUTE_NOT_REOPENABLE"]);
    expect(submitStateFaults({ domain: "payment", status: "DRAFT", latest: { status: "REJECTED", applied: "RETURN_TO_ORIGINATOR", choices: [] } })).toEqual([]);
    expect(submitStateFaults({ domain: "payment", status: "DRAFT", latest: { status: "RECALLED", applied: null, choices: [] } })).toEqual([]);
  });
});

describe("the figure it is routed on, from the figures as they stand (overrides included)", () => {
  const snap = assembleInterim({
    valuation: { id: "v", trigger: "VALUATION_DATE", triggerDate: null, valuationDate: "2026-07-10", mainWorks: parseSen("100000.00"), jointRecorded: true, materials: [], parties: [], deductions: [{ kind: "WAGES", label: "", amount: parseSen("1000.00") }] },
    computedOn: "2026-07-10",
    baseline: { version: 1, values: { contractSum: parseSen("1000000.00"), dateForCompletion: null, retentionApplies: false, retentionPercent: null, retentionCapPercent: null, retentionSource: "DERIVED", unfixedMaterialsPct: null, firstInterimMinimum: parseSen("1000.00"), subsequentInterimMinimum: parseSen("1000.00"), ladDaily: null, sections: [] } as never },
    policy: { materialsPct: null, materialsProvenance: null, preExecutionLimit: null, preExecutionProvenance: null, remainder: null, remainderProvenance: null },
    issued: [],
    foreign: [],
    liveKinds: [],
    adjustments: [],
    releases: [],
    advances: [],
    decision: null,
    pending: [],
    preExecution: { executed: true, gate: [], withoutReceipt: [], perkesoRecorded: true },
  }).result.snapshot!;
  it("the payment recommended, or the gross this period; unset refuses", () => {
    expect(routeValueOf("INTERIM_PAYMENT", applyOverrides(snap, []), "RECOMMENDED", 0n)).toMatchObject({ value: parseSen("99000.00") });
    expect(routeValueOf("INTERIM_PAYMENT", applyOverrides(snap, []), "GROSS_THIS_PERIOD", 0n)).toMatchObject({ value: parseSen("100000.00") });
    expect(codes(routeValueOf("INTERIM_PAYMENT", applyOverrides(snap, []), null, 0n) as never)).toEqual(["ROUTE_FIGURE_NOT_SET"]);
  });
  it("an override in draft moves the figure the route reads", () => {
    const e = applyOverrides(snap, [{ fieldKey: "wages", computed: "1000.00", overridden: "2000.00", justification: "x", personName: "p", recordedAt: new Date() }]);
    expect(routeValueOf("INTERIM_PAYMENT", e, "RECOMMENDED", 0n)).toMatchObject({ value: parseSen("98000.00") });
  });
  it("the non-completion certificate at the contract sum it pinned", () => {
    expect(routeValueOf("NON_COMPLETION", null, null, parseSen("1077508.60"))).toMatchObject({ value: parseSen("1077508.60") });
  });
  it("once a route is open on them the figures are frozen: no override (614-C4, the core's rule)", () => {
    const r = overrideFaults({ status: "DRAFT", snapshot: snap, current: applyOverrides(snap, []), fieldKey: "wages", value: "2000.00", justification: "x", personKnown: true, routeOpen: true });
    expect(codes(r.faults)).toEqual(["OVERRIDE_ROUTE_OPEN"]);
    expect(overrideFaults({ status: "DRAFT", snapshot: snap, current: applyOverrides(snap, []), fieldKey: "wages", value: "2000.00", justification: "x", personKnown: true, routeOpen: false }).faults).toEqual([]);
  });
});

describe("Finance's payment (FR-PAY-019)", () => {
  const ok = { issued: true, already: false, batchNo: "PV-2026-0012", paidOn: "2026-07-20", issuedOn: "2026-07-15", today: "2026-07-21", amount: parseSen("150606.00") };
  it("once, on an issued certificate, with its batch, on or after issue and never ahead of today", () => {
    expect(financeFaults(ok)).toEqual([]);
    expect(codes(financeFaults({ ...ok, issued: false, amount: null }))).toEqual(["NOT_ISSUED"]);
    expect(codes(financeFaults({ ...ok, already: true, batchNo: " " }))).toEqual(["PAYMENT_ALREADY_RECORDED", "BATCH_REQUIRED"]);
    expect(codes(financeFaults({ ...ok, paidOn: "2026-07-14" }))).toEqual(["PAID_BEFORE_ISSUE"]);
    expect(codes(financeFaults({ ...ok, paidOn: "2026-07-22" }))).toEqual(["FUTURE_DATE"]);
  });
});
