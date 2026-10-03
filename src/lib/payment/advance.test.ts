import { describe, expect, it } from "vitest";

import { DAL_FIXTURE } from "@/lib/authority/dal-fixture";
import { parseSen, senToDecimalString } from "@/lib/money";

import { applicationFaults, recoupments, type ApplicationInput } from "./advance";
import { resolveCertificateRoute } from "./route";

/// FR-PAY-001, 002; B2 as ruled (OD-A9 A): a mechanism only. FIXTURE figures (invented); the DAL rows are test-only.
const s = parseSen;
const APG = { kind: "ADVANCE_PAYMENT_GUARANTEE", status: "VERIFIED", effectiveFrom: "2026-01-01", expiresOn: "2027-01-01", value: s("100000.00") };
const base: ApplicationInput = { party: "MAIN", partyKnown: true, amount: s("100000.00"), guarantee: APG, schedule: [{ sequence: 2, amount: s("50000.00") }, { sequence: 3, amount: s("50000.00") }], issuedInterims: 1, liveForParty: false, today: "2026-07-01" };
const codes = (i: ApplicationInput) => applicationFaults(i).map((f) => f.code);

describe("the advance application (B2)", () => {
  it("sound: an amount, a verified and live guarantee, a schedule that adds up", () => {
    expect(codes(base)).toEqual([]);
  });
  it("the guarantee: none, not an APG, not verified, not live on the day", () => {
    expect(codes({ ...base, guarantee: null })).toEqual(["APG_REQUIRED"]);
    expect(codes({ ...base, guarantee: { ...APG, kind: "PERFORMANCE_BOND" } })).toEqual(["APG_NOT_AN_APG"]);
    expect(codes({ ...base, guarantee: { ...APG, status: "LODGED" } })).toEqual(["APG_NOT_VERIFIED"]);
    expect(codes({ ...base, guarantee: { ...APG, expiresOn: "2026-06-30" } })).toEqual(["APG_NOT_LIVE"]);
  });
  it("a guarantee for less than the advance is said (a warning: no rule states the cover)", () => {
    expect(applicationFaults({ ...base, guarantee: { ...APG, value: s("90000.00") } })).toEqual([{ code: "APG_BELOW_ADVANCE", level: "warn", data: { value: "9000000", amount: "10000000" } }]);
  });
  it("the schedule: unset refused (SCHEDULE_NOT_SET); not adding up; on a certificate already issued; repeated", () => {
    expect(codes({ ...base, schedule: [] })).toEqual(["SCHEDULE_NOT_SET"]);
    expect(codes({ ...base, schedule: [{ sequence: 2, amount: s("50000.00") }] })).toEqual(["SCHEDULE_NOT_BALANCED"]);
    expect(codes({ ...base, schedule: [{ sequence: 1, amount: s("50000.00") }, { sequence: 2, amount: s("50000.00") }] })).toEqual(["SCHEDULE_PAST"]);
    expect(codes({ ...base, schedule: [{ sequence: 2, amount: s("50000.00") }, { sequence: 2, amount: s("50000.00") }] })).toEqual(["SCHEDULE_REPEATED"]);
  });
  it("a nominated sub-contractor's advance names its party; one live advance per party", () => {
    expect(codes({ ...base, party: "NSC", partyKnown: false })).toEqual(["ADVANCE_PARTY_REQUIRED"]);
    expect(codes({ ...base, liveForParty: true })).toEqual(["ADVANCE_ALREADY_LIVE"]);
  });
});

describe("recoupment (FR-PAY-002)", () => {
  const main = { id: "a1", party: "MAIN" as const, amount: s("100000.00"), schedule: base.schedule, recouped: 0n };
  const nsc = { id: "a2", party: "NSC" as const, amount: s("10000.00"), schedule: [{ sequence: 2, amount: s("10000.00") }], recouped: 0n };
  it("each certificate recoups its scheduled amount, main and nominated apart", () => {
    const r = recoupments([main, nsc], 2);
    expect([r.main, r.nsc].map(senToDecimalString)).toEqual(["50000.00", "10000.00"]);
    expect(r.lines.map((l) => senToDecimalString(l.balanceAfter))).toEqual(["50000.00", "0.00"]);
  });
  it("never more than is still unrecouped", () => {
    const r = recoupments([{ ...main, recouped: s("70000.00") }], 3);
    expect(senToDecimalString(r.main)).toBe("30000.00");
    expect(recoupments([{ ...main, recouped: s("100000.00") }], 3).main).toBe(0n);
  });
  it("a certificate with no scheduled row recoups nothing", () => {
    expect(recoupments([main], 4).main).toBe(0n);
  });
});

describe("the advance's route (example 14)", () => {
  it("routes to the CEO at any value in the tender regime; no row in the quotation regime refuses naming the matrix", () => {
    for (const v of ["10000.00", "5000000.00"]) {
      const r = resolveCertificateRoute(DAL_FIXTURE, { domain: "advance_payment", value: s(v), contractValue: s("9000000.00"), method: "tender", contractTypeCode: null }, "Fixture matrix");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.resolution.chain.map((x) => `${x.roleCode}:${x.act}`)).toEqual(["CP:P", "HODIV:R", "CEO:A"]);
    }
    const q = resolveCertificateRoute(DAL_FIXTURE, { domain: "advance_payment", value: s("50000.00"), contractValue: s("90000.00"), method: "quotation", contractTypeCode: null }, "Fixture matrix");
    expect(q).toMatchObject({ ok: false, faults: [{ code: "ROUTE_UNRESOLVED", data: { matrix: "Fixture matrix", domain: "advance_payment" } }] });
  });
});
