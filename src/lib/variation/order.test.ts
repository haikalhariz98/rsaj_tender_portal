import { describe, expect, it } from "vitest";

import { snapshotFaults, totalsFrom } from "@/lib/certificate/snapshot";
import { parseSen } from "@/lib/money";

import type { RouteFact, VariationFacts } from "./application";
import { applicationFigures, orderApprovalFaults, orderFaults, orderFigures, orderTotals } from "./order";

/** The application (VO-660) and the order (VO-663): their figures, and what each needs before it is signed. */

const S = parseSen;
const r = (event: RouteFact["event"], status: string, value: string): RouteFact => ({ id: `${event}${status}${value}`, event, status, value: S(value), applied: null, choices: [], openedOn: "2026-05-01" });
const v = (x: Partial<VariationFacts> = {}): VariationFacts => ({ id: "v1", status: "SUPPORTED", exemption: null, estimate: S("90000.00"), soDecision: "SUPPORTED", soDecisionCap: null, routes: [r("PRIOR", "APPROVED", "90000.00")], instructions: [{ id: "i", certificateStatus: "ISSUED" }], orders: [], commencedOn: null, ...x });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const tot = (snap: ReturnType<typeof applicationFigures>, key: string) => totalsFrom(snap, new Map(snap.lines.map((l) => [l.key, l.value]))).get(key);

describe("the application's figures (VO-660 §3.5–3.6), worked out and frozen", () => {
  const snap = applicationFigures({
    computedOn: "2026-05-02", reference: "VO/2026/0001", original: S("750000.00"), adjustedNet: S("0.00"), possessionDate: "2026-01-05", dateForCompletion: "2026-08-31",
    extensions: { en: "None recorded", ms: "Tiada direkodkan" }, progress: { pct: "42.5", on: "2026-04-30" }, description: "Additional valve chamber", reason: "Found on site",
    estimate: S("90000.00"), routedValue: S("90000.00"), soDecision: { en: "Supported", ms: "Disokong" }, thisPct: { en: "12.00%", ms: "12.00%" },
    cumulative: S("65000.00"), cumulativePct: { en: "20.67%", ms: "20.67%" }, periodImplication: false, basis: { en: "This variation alone, over the original contract sum (assumed)", ms: "x" },
  });
  it("sound as the core takes it", () => expect(snapshotFaults(snap)).toEqual([]));
  it("new sum = 750,000.00 + 65,000.00 + 90,000.00 = 905,000.00", () => expect(tot(snap, "newSum")).toBe("905000.00"));
  it("the revised sum is the original plus the issued adjustments", () => expect(tot(snap, "revisedSum")).toBe("750000.00"));
});

describe("the order's figures (VO-663, FR-VAR-020)", () => {
  const lines = [
    { itemRef: "V1/1", description: "Chamber walls", particulars: "12.500 m³ at RM480.00", amount: S("6000.00"), direction: "ADDITION" as const },
    { itemRef: "V1/2", description: "Valve DN300", particulars: "1 no at RM84,600.00", amount: S("84600.00"), direction: "ADDITION" as const },
    { itemRef: "V1/3", description: "Omitted thrust block", particulars: "1 no at RM1,100.00", amount: S("1100.00"), direction: "OMISSION" as const },
  ];
  const o = orderFigures({ computedOn: "2026-06-20", original: S("750000.00"), reference: "VO/2026/0001", instruction: { number: "DEMO/CERT/00300", date: "2026-05-20" }, description: "Additional valve chamber", clauseTitle: "Valuation of variations", exemption: null, lines, approved: S("90000.00"), cumulative: S("65000.00"), cumulativePct: { en: "20.67%", ms: "20.67%" } });
  it("net = additions 90,600.00 − omissions 1,100.00 = 89,500.00, an addition", () => {
    expect(o.totals).toEqual({ additions: S("90600.00"), omissions: S("1100.00"), net: S("89500.00"), direction: "ADDITION" });
    expect(snapshotFaults(o.snapshot)).toEqual([]);
    expect(tot(o.snapshot, "net")).toBe("89500.00");
  });
  it("more omitted than added: an omission", () => {
    expect(orderTotals([{ amount: S("10.00"), direction: "ADDITION" }, { amount: S("10.01"), direction: "OMISSION" }])).toMatchObject({ net: S("-0.01"), direction: "OMISSION" });
  });
  it("its description is the instruction's, word for word; measured; a clause chosen; one at a time", () => {
    const base = { v: v(), instructionIssued: true, orderLive: false, lines: 3, description: "Additional valve chamber", instructionDescription: "Additional valve chamber", clauseChosen: true };
    expect(orderFaults(base)).toEqual([]);
    expect(codes(orderFaults({ ...base, description: "Additional valve chamber." }))).toEqual(["DESCRIPTION_NOT_INSTRUCTION"]);
    expect(codes(orderFaults({ ...base, lines: 0 }))).toEqual(["NO_MEASUREMENT"]);
    expect(codes(orderFaults({ ...base, clauseChosen: false }))).toEqual(["FIELD_REQUIRED"]);
    expect(codes(orderFaults({ ...base, orderLive: true }))).toEqual(["ORDER_EXISTS"]);
    expect(codes(orderFaults({ ...base, instructionIssued: false }))).toEqual(["INSTRUCTION_NOT_ISSUED"]);
  });
});

describe("what the order's value must be covered by before it is signed", () => {
  it("within the prior approval: signable", () => expect(orderApprovalFaults({ v: v(), net: S("89500.00"), agreedRateTotal: 0n })).toEqual([]));
  it("beyond it: the increase needs its own approval (FR-VAR-008 ii); an approved increase covers it", () => {
    expect(codes(orderApprovalFaults({ v: v(), net: S("95000.00"), agreedRateTotal: 0n }))).toEqual(["INCREASE_NOT_APPROVED"]);
    expect(orderApprovalFaults({ v: v({ routes: [r("PRIOR", "APPROVED", "90000.00"), r("INCREASE", "APPROVED", "5000.00")] }), net: S("95000.00"), agreedRateTotal: 0n })).toEqual([]);
    expect(codes(orderApprovalFaults({ v: v({ routes: [r("PRIOR", "APPROVED", "90000.00"), r("INCREASE", "PENDING", "5000.00")] }), net: S("95000.00"), agreedRateTotal: 0n }))).toEqual(["INCREASE_NOT_APPROVED"]);
  });
  it("items at agreed rates beyond their approval (FR-VAR-008 iii)", () => {
    expect(codes(orderApprovalFaults({ v: v(), net: S("1.00"), agreedRateTotal: S("1.00") }))).toEqual(["AGREED_RATE_BEYOND_APPROVAL"]);
    expect(orderApprovalFaults({ v: v({ routes: [r("PRIOR", "APPROVED", "90000.00"), r("AGREED_RATE", "APPROVED", "10000.00")] }), net: S("1.00"), agreedRateTotal: S("10000.00") })).toEqual([]);
  });
  it("an exempt re-measurement needs its own route at the order's value, either way (FR-PAD-004)", () => {
    const rm = v({ exemption: "REMEASUREMENT", soDecision: null, routes: [] });
    expect(codes(orderApprovalFaults({ v: rm, net: S("-35000.00"), agreedRateTotal: 0n }))).toEqual(["REMEASUREMENT_NOT_APPROVED"]);
    expect(orderApprovalFaults({ v: { ...rm, routes: [r("REMEASUREMENT", "APPROVED", "35000.00")] }, net: S("-35000.00"), agreedRateTotal: 0n })).toEqual([]);
    expect(codes(orderApprovalFaults({ v: { ...rm, routes: [r("REMEASUREMENT", "APPROVED", "34999.99")] }, net: S("-35000.00"), agreedRateTotal: 0n }))).toEqual(["REMEASUREMENT_NOT_APPROVED"]);
  });
  it("another exempt category: no route by FR-VAR-004 (BD-613-53); unapproved non-exempt is refused", () => {
    expect(orderApprovalFaults({ v: v({ exemption: "REDUCTION", routes: [] }), net: S("-5000.00"), agreedRateTotal: 0n })).toEqual([]);
    expect(codes(orderApprovalFaults({ v: v({ routes: [] }), net: S("1.00"), agreedRateTotal: 0n }))).toEqual(["NOT_APPROVED"]);
  });
});
