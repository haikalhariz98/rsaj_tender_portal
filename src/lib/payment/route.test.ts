import { describe, expect, it } from "vitest";

import { DAL_FIXTURE } from "@/lib/authority/dal-fixture";
import type { Matrix } from "@/lib/authority/types";
import { CERTIFICATE_KINDS } from "@/lib/certificate/types";
import { parseSen } from "@/lib/money";

import { interimRouteFigure, KIND_ROUTE_DOMAIN, resolveCertificateRoute } from "./route";

/**
 * FR-PAY-016 and OD-A6 as ruled. The bands are the test-only DAL fixture's rows (§3.1.4.4 item 16): RM100,000 and
 * RM500,000 are rows, never code. The edges follow the fixture matrix's boundary switch, as every route does.
 */

const s = parseSen;
const route = (value: string, contract = "9000000.00", m: Matrix = DAL_FIXTURE) => resolveCertificateRoute(m, { domain: "payment", value: s(value), contractValue: s(contract), method: "tender", contractTypeCode: null }, "Fixture matrix");
const approver = (r: ReturnType<typeof route>) => (r.ok ? r.resolution.approverCode : r.faults[0].code);

describe("the interim certificate's route (example 10)", () => {
  it("RM620,000 on a RM9,000,000 contract → CEO; RM80,000 on the same contract → Head of Division", () => {
    expect(approver(route("620000.00"))).toBe("CEO");
    expect(approver(route("80000.00"))).toBe("HODIV");
  });
  it("exactly RM500,000.00 → Functional Director; a sen over → CEO", () => {
    expect(approver(route("500000.00"))).toBe("FD");
    expect(approver(route("500000.01"))).toBe("CEO");
  });
  it("exactly RM100,000.00 → Head of Division; a sen over → Functional Director", () => {
    expect(approver(route("100000.00"))).toBe("HODIV");
    expect(approver(route("100000.01"))).toBe("FD");
  });
  it("no row for the matter: refused naming the matrix", () => {
    const r = resolveCertificateRoute(DAL_FIXTURE, { domain: "payment", value: s("80000.00"), contractValue: s("90000.00"), method: "quotation", contractTypeCode: null }, "Fixture matrix");
    expect(r).toMatchObject({ ok: false, faults: [{ code: "ROUTE_UNRESOLVED", data: { matrix: "Fixture matrix" } }] });
  });
  it("a chain with a committee's step is refused (a certificate is not tabled at a sitting yet)", () => {
    const committee: Matrix = { ...DAL_FIXTURE, rules: DAL_FIXTURE.rules.map((r) => (r.domain === "payment" ? { ...r, committeeCode: "TBC", committeeAct: "A" as const, approverCode: "TBC" } : r)) };
    expect(approver(route("80000.00", "9000000.00", committee))).toBe("ROUTE_HAS_COMMITTEE");
  });
});

describe("the route figure (OD-A6)", () => {
  const figs = { recommended: s("150606.00"), grossThisPeriod: s("155000.00") };
  it("unset refuses (NOT_SET), never a default", () => {
    expect(interimRouteFigure(null, figs)).toEqual({ state: "NOT_SET" });
  });
  it("the payment recommended, or the gross this period, as chosen", () => {
    expect(interimRouteFigure("RECOMMENDED", figs)).toEqual({ state: "SET", figure: "RECOMMENDED", value: s("150606.00") });
    expect(interimRouteFigure("GROSS_THIS_PERIOD", figs)).toEqual({ state: "SET", figure: "GROSS_THIS_PERIOD", value: s("155000.00") });
    expect(interimRouteFigure("RECOMMENDED", { recommended: null, grossThisPeriod: null })).toEqual({ state: "NOT_COMPUTED" });
  });
});

describe("which kinds route here (an exhaustive map)", () => {
  it("every certificate kind is decided", () => {
    expect(Object.keys(KIND_ROUTE_DOMAIN).sort()).toEqual([...CERTIFICATE_KINDS].sort());
    expect(KIND_ROUTE_DOMAIN.INTERIM_PAYMENT).toBe("payment");
    expect(KIND_ROUTE_DOMAIN.ADVANCE_PAYMENT).toBe("advance_payment");
    expect(KIND_ROUTE_DOMAIN.NON_COMPLETION).toBe("non_completion");
  });
});
