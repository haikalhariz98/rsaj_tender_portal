import { describe, expect, it } from "vitest";

import { DAL_FIXTURE } from "@/lib/authority/dal-fixture";
import type { Matrix, Rule } from "@/lib/authority/types";
import { parseSen } from "@/lib/money";

import { variationReading } from "./percent";
import { edgesOf, regimeOf, resolveVariationRoute, routeDomainOf, routePercentLabel } from "./route";

/**
 * A variation's route on the matrix (FR-VAR-011, 012, 010, FR-PAD-004; ADR 0024 Amendment 1), on the spec's worked
 * examples 7–9 and the test-only Appendix B fixture (never seeded). The re-measurement rows are this test's own
 * fixture of DAL §3.1.4.4 item 8 (Tender Board above 30%, the S.O./P.D. at or below it).
 */

const S = parseSen;
const K = 1_000;
const M = 1_000_000;
const rule = (r: Partial<Rule> & Pick<Rule, "ruleKey" | "domain">): Rule => ({ ...DAL_FIXTURE.rules[0], method: null, cond: null, minValue: null, maxValue: null, pctMin: null, pctMax: null, contractValueMin: null, contractValueMax: null, followsBoundarySwitch: true, labelEn: r.ruleKey, labelMs: null, proposerCode: null, approverCode: null, committeeCode: null, committeeAct: null, nonDelegable: false, approverMandatory: false, isGap: false, gapNote: null, note: "", clause: "Appendix B", sortOrder: 0, recommenders: [], generateCoreChain: null, coreChainReason: null, ...r });
const MATRIX: Matrix = {
  ...DAL_FIXTURE,
  roles: { ...DAL_FIXTURE.roles, SOPD: { code: "SOPD", nameEn: "The S.O. or Project Director", nameMs: "P.P.", isCommittee: false, escalatesToCode: null, selfApprovalEscalatesToCode: null } },
  rules: [
    ...DAL_FIXTURE.rules,
    rule({ ruleKey: "T_REMEASURE_ABOVE_30", domain: "remeasurement", method: "tender", pctMin: "30", proposerCode: "CP", recommenders: [{ roleCode: "HODIV", act: "R" }], approverCode: "TBC", committeeCode: "TBC", committeeAct: "A", clause: "§3.1.4.4 item 8a" }),
    rule({ ruleKey: "T_REMEASURE_UP_TO_30", domain: "remeasurement", method: "tender", pctMax: "30", approverCode: "SOPD", clause: "§3.1.4.4 item 8b" }),
  ],
};
const ctx = { dal: MATRIX, override: null, supersedes: false };
const route = (domain: string, method: string, num: string, den: string) => {
  const r = resolveVariationRoute(ctx, { domain, value: S(num), contractValue: S(den), ratio: { num: S(num), den: S(den) }, method, contractTypeCode: null }, "Fixture", () => false);
  return r.ok ? r.resolution.chain.map((s) => `${s.roleCode}:${s.act}`) : r.faults.map((f) => f.code);
};

describe("§6.9.3 examples 7–9 through the variation's route", () => {
  it("7. 12%: 90,000.00 / 750,000.00 on a tender contract → VOC MR (a committee's step) → CEO", () => {
    expect(route("vo", "tender", "90000.00", "750000.00")).toEqual(["VOC:MR", "CEO:A"]);
  });
  it("8. 12%: 288,000.00 / 2,400,000.00 → CEO (contract RM1M–3M, above 10% up to 30%)", () => {
    expect(route("vo", "tender", "288000.00", "2400000.00")).toEqual(["VOC:MR", "CEO:A"]);
  });
  it("9. 12%: 21,600.00 / 180,000.00 in the quotation regime → Head of Division, no mandatory recommendation", () => {
    expect(route("vo", "quotation", "21600.00", "180000.00")).toEqual(["HODIV:A"]);
  });
  it("a 4% variation on the same RM750,000 contract routes to another office (FR-VAR-011)", () => {
    expect(route("vo", "tender", "30000.00", "750000.00")).toEqual(["VOC:MR", "HODIV:A"]);
  });
  it("exactly 75,000.00 (10.00%) → the Functional Director's cell; 75,000.01 → the CEO's (the exact ratio, the switch's side)", () => {
    expect(route("vo", "tender", "75000.00", "750000.00")).toEqual(["VOC:MR", "FD:A"]);
    expect(route("vo", "tender", "75000.01", "750000.00")).toEqual(["VOC:MR", "CEO:A"]);
  });
  it("the committee's step is kept on the route, non-delegable (FR-VAR-010)", () => {
    const r = resolveVariationRoute(ctx, { domain: "vo", value: S("90000.00"), contractValue: S("750000.00"), ratio: { num: S("90000.00"), den: S("750000.00") }, method: "tender", contractTypeCode: null }, "Fixture", () => false);
    expect(r.ok && r.resolution.chain.find((s) => s.roleCode === "VOC")).toMatchObject({ committeeCode: "VOC", nonDelegable: true });
  });
  it("no row: refused, naming the matrix", () => {
    const r = resolveVariationRoute(ctx, { domain: "vo_increase", value: S("1.00"), contractValue: S("750000.00"), ratio: { num: S("1.00"), den: S("750000.00") }, method: "tender", contractTypeCode: null }, "Fixture issue", () => false);
    expect(!r.ok && r.faults[0]).toMatchObject({ code: "VARIATION_ROUTE_UNRESOLVED", data: { matrix: "Fixture issue", domain: "vo_increase" } });
  });
});

describe("re-measurement (FR-PAD-004)", () => {
  it("35% on a tender contract → Tender Board; 30.00% → the S.O./P.D.", () => {
    expect(route("remeasurement", "tender", "350000.00", "1000000.00")).toEqual(["CP:P", "HODIV:R", "TBC:A"]);
    expect(route("remeasurement", "tender", "300000.00", "1000000.00")).toEqual(["SOPD:A"]);
  });
  it("the quotation regime routes it through the variation bands; the regime is the matrix's own reading of the contract value", () => {
    expect(regimeOf(MATRIX, S("180000.00"))).toBe("quotation");
    expect(regimeOf(MATRIX, S("1000000.00"))).toBe("tender");
    expect(routeDomainOf("REMEASUREMENT", "quotation")).toBe("vo");
    expect(routeDomainOf("REMEASUREMENT", "tender")).toBe("remeasurement");
    expect([routeDomainOf("PRIOR", null), routeDomainOf("INCREASE", null), routeDomainOf("AGREED_RATE", null)]).toEqual(["vo", "vo_increase", "vo_agreed_rate"]);
  });
});

describe("the reading feeds the route, and the label names the matrix's edges", () => {
  it("the demo's assumed reading on a 12% variation: THIS_VARIATION over ORIGINAL", () => {
    const r = variationReading({ basis: "THIS_VARIATION", base: "ORIGINAL", original: S("750000.00"), adjustments: [], cumulativeApproved: S("60000.00"), event: "PRIOR", value: S("90000.00") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(resolveVariationRoute(ctx, { domain: "vo", value: S("90000.00"), contractValue: BigInt(r.reading.baseAmount), ratio: r.ratio, method: "tender", contractTypeCode: null }, "F", () => false).ok).toBe(true);
  });
  it("the edges of a domain's rows", () => {
    expect(edgesOf(MATRIX.rules, "vo").sort()).toEqual(["10", "15", "20", "30", "5", "50"].sort());
    expect(edgesOf(MATRIX.rules, "remeasurement")).toEqual(["30"]);
  });
  it("whoever sends it and holds the approving office does not approve it: the engine escalates", () => {
    const r = resolveVariationRoute(ctx, { domain: "vo", value: S("90000.00"), contractValue: S("750000.00"), ratio: { num: S("90000.00"), den: S("750000.00") }, method: "tender", contractTypeCode: null }, "F", (code) => code === "CEO");
    // The fixture sets no office to approve in the CEO's place: refused, saying why (never routed to the sender).
    expect(!r.ok && r.faults[0]).toMatchObject({ code: "VARIATION_ROUTE_UNRESOLVED" });
    expect(!r.ok && String(r.faults[0].data?.why)).toMatch(/approving their own matter/);
  });
  it("a 3M+ contract's 30% edge, the fixture's K and M", () => {
    expect(route("vo", "tender", String(900 * K) + ".00", String(3 * M + 1) + ".00")).toEqual(["VOC:MR", "CEO:A"]);
  });
});

describe("the domains a variation's matters are on", () => {
  it("every event's domain, and the funder's consent, and nothing else", async () => {
    const { VARIATION_DOMAINS } = await import("./domains");
    expect([...VARIATION_DOMAINS].sort()).toEqual([...new Set([...Object.values((await import("./route")).EVENT_DOMAIN), "vo_funder_consent"])].sort());
  });
});

describe("run 3 review MUST 2: the label frozen with a route reads its own domain's edges (OD-A3 A)", () => {
  it("a re-measurement at 30.004% of RM1,000,000 reads \"more than 30.00%\" on the re-measurement rows", () => {
    expect(routePercentLabel(MATRIX.rules, "remeasurement", { num: S("300040.00"), den: S("1000000.00") })).toEqual({ en: "more than 30.00%", ms: "lebih daripada 30.00%" });
  });
  it("exactly 30.00% is on the edge, and a domain with no 30% edge never reads one beside it", () => {
    expect(routePercentLabel(MATRIX.rules, "remeasurement", { num: S("300000.00"), den: S("1000000.00") }).en).toBe("30.00%");
    expect(routePercentLabel(MATRIX.rules, "vo_agreed_rate", { num: S("300040.00"), den: S("1000000.00") }).en).toBe("30.00%");
  });
  it("75,000.01 of 750,000.00 on the variation rows reads \"more than 10.00%\", never \"10.00%\"", () => {
    expect(routePercentLabel(MATRIX.rules, "vo", { num: S("75000.01"), den: S("750000.00") }).en).toBe("more than 10.00%");
  });
});
