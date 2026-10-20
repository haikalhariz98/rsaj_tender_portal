import { describe, expect, it } from "vitest";

import { formatSen, parseSen } from "@/lib/money";

import {
  actionResult,
  againstBill,
  benchmarkRow,
  classificationFault,
  custodyList,
  disclose,
  estimateView,
  exerciseAllowsEstimate,
  figureReaderOf,
  leadTime,
  lodgeFaults,
  lodgementBehind,
  overrideFaults,
  retainFaults,
  retainedCopyDue,
  sealFigures,
  startFault,
  versionFaults,
  viewFault,
  voidFault,
  type EstimateFacts,
} from "./estimate";
import { UNSET_SCOPE_POLICY } from "./types";

const sen = parseSen;
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const blocks = (fs: { code: string; level: string }[]) => fs.filter((f) => f.level === "block").map((f) => f.code);
const KL = "Asia/Kuala_Lumpur";
const now = new Date("2026-10-01T03:00:00Z");
const ctx = (x: Partial<Parameters<typeof versionFaults>[2]> = {}) => ({ closingAt: null, timeZone: KL, exerciseStatus: "DRAFT" as const, now, ...x });
const est = (x: Partial<EstimateFacts & { id: string }> = {}): EstimateFacts & { id: string } => ({ id: "e1", state: "DRAFT", preparerPersonId: "p11", currentVersionNo: 1, classification: "SULIT", lodgedVersionNo: null, retainedVersionNo: null, ...x });

describe("preparing and amending (FR-EST-007, 009; OD-2; X-1)", () => {
  it("version 1 by its preparer, a positive figure, needs no reason", () => {
    expect(blocks(versionFaults({ value: sen("330000.00"), personId: "p11", reason: "" }, null, ctx()))).toEqual([]);
    // The figure must fit CompanyEstimateVersion.value, Decimal(18, 2): refused by code, never echoed.
    expect(blocks(versionFaults({ value: sen("9999999999999999.99"), personId: "p11", reason: "" }, null, ctx()))).toEqual([]);
    expect(blocks(versionFaults({ value: sen("10000000000000000.00"), personId: "p11", reason: "" }, null, ctx()))).toEqual(["TOO_LARGE"]);
    expect(actionResult(versionFaults({ value: sen("10000000000000000.00"), personId: "p11", reason: "" }, null, ctx()))).toEqual({ ok: false, codes: ["TOO_LARGE"] });
  });
  it("a second Person amending gets SECOND_PREPARER", () => {
    expect(blocks(versionFaults({ value: sen("1.00"), personId: "p10", reason: "Rates revised." }, est(), ctx()))).toEqual(["SECOND_PREPARER"]);
  });
  it("version 2 without a reason is refused", () => {
    expect(blocks(versionFaults({ value: sen("1.00"), personId: "p11", reason: " " }, est(), ctx()))).toEqual(["REASON_REQUIRED"]);
    expect(blocks(versionFaults({ value: sen("1.00"), personId: "p11", reason: "Excavation re-measured." }, est(), ctx()))).toEqual([]);
  });
  it("a figure that is zero, negative or not a figure is refused", () => {
    expect(blocks(versionFaults({ value: 0n, personId: "p11", reason: "" }, null, ctx()))).toEqual(["NOT_POSITIVE"]);
    expect(blocks(versionFaults({ value: -1n, personId: "p11", reason: "" }, null, ctx()))).toEqual(["NOT_POSITIVE"]);
    expect(blocks(versionFaults({ value: null, personId: "p11", reason: "" }, null, ctx()))).toEqual(["NOT_POSITIVE"]);
    expect(blocks(versionFaults({ value: 1n, personId: null, reason: "" }, null, ctx()))).toEqual(["PERSON_REQUIRED"]);
  });
  it("X-1: closing not set reads 'Closing not set' and does not block — 6.2's action always passes null", () => {
    const f = versionFaults({ value: sen("1.00"), personId: "p11", reason: "x" }, est(), ctx({ closingAt: null }));
    expect(f).toContainEqual({ code: "CLOSING_NOT_SET", level: "info" });
    expect(blocks(f)).toEqual([]);
  });
  it("amending after closingAt is refused; at the closing instant too; before it, not", () => {
    const closingAt = new Date("2026-10-01T06:30:00Z");
    expect(blocks(versionFaults({ value: 1n, personId: "p11", reason: "x" }, est(), ctx({ closingAt, now: new Date("2026-10-01T06:30:00Z") })))).toEqual(["AFTER_CLOSING"]);
    expect(blocks(versionFaults({ value: 1n, personId: "p11", reason: "x" }, est(), ctx({ closingAt, now: new Date("2026-10-01T06:31:00Z") })))).toEqual(["AFTER_CLOSING"]);
    expect(blocks(versionFaults({ value: 1n, personId: "p11", reason: "x" }, est(), ctx({ closingAt, now: new Date("2026-10-01T06:29:59Z") })))).toEqual([]);
  });
  it("amending after DISCLOSED, on a void estimate, on a cancelled exercise, or with no time zone is refused", () => {
    expect(blocks(versionFaults({ value: 1n, personId: "p11", reason: "x" }, est({ state: "DISCLOSED" }), ctx()))).toEqual(["DISCLOSED"]);
    expect(blocks(versionFaults({ value: 1n, personId: "p11", reason: "x" }, est({ state: "VOID" }), ctx()))).toEqual(["VOID"]);
    expect(blocks(versionFaults({ value: 1n, personId: "p11", reason: "x" }, est(), ctx({ exerciseStatus: "CANCELLED" })))).toEqual(["EXERCISE_CANCELLED"]);
    expect(blocks(versionFaults({ value: 1n, personId: "p11", reason: "x" }, est(), ctx({ timeZone: null })))).toEqual(["TIME_ZONE_NOT_SET"]);
  });
  it("a lodged estimate may still be amended by its preparer before closing; the lodged copy is then behind", () => {
    expect(blocks(versionFaults({ value: 1n, personId: "p11", reason: "x" }, est({ state: "LODGED", lodgedVersionNo: 1 }), ctx()))).toEqual([]);
    expect(lodgementBehind(est({ state: "LODGED", lodgedVersionNo: 1, currentVersionNo: 2 }))).toBe(true);
    expect(lodgementBehind(est({ state: "LODGED", lodgedVersionNo: 2, currentVersionNo: 2 }))).toBe(false);
  });
  it("findings never carry the figure", () => {
    const f = versionFaults({ value: sen("4321987.65"), personId: "p10", reason: "a secret reason" }, est(), ctx({ closingAt: new Date("2026-01-01T00:00:00Z") }));
    expect(JSON.stringify(f)).not.toMatch(/4321987|432198765|secret/);
  });
  it("every exercise status is answered (X-8)", () => {
    expect(exerciseAllowsEstimate("DRAFT")).toBe("OPEN");
    expect(exerciseAllowsEstimate("DOCUMENTS_IN_PREPARATION")).toBe("OPEN");
    expect(exerciseAllowsEstimate("CANCELLED")).toBe("EXERCISE_CANCELLED");
  });
});

describe("OD-2: void and restart, at most one live estimate", () => {
  it("starting while a non-VOID estimate exists is refused; with only void ones it is not", () => {
    expect(startFault([{ state: "DRAFT" }])?.code).toBe("LIVE_ESTIMATE_EXISTS");
    expect(startFault([{ state: "VOID" }, { state: "LODGED" }])?.code).toBe("LIVE_ESTIMATE_EXISTS");
    expect(startFault([{ state: "VOID" }, { state: "VOID" }])).toBeNull();
    expect(startFault([])).toBeNull();
  });
  it("voiding after LODGED is refused; before it, with a reason, it is not", () => {
    expect(codes(voidFault(est({ state: "LODGED" }), "Preparer transferred."))).toEqual(["AFTER_LODGEMENT"]);
    expect(codes(voidFault(est({ state: "DISCLOSED" }), "x"))).toEqual(["AFTER_LODGEMENT"]);
    expect(codes(voidFault(est(), " "))).toEqual(["REASON_REQUIRED"]);
    expect(codes(voidFault(est({ state: "VOID" }), "x"))).toEqual(["ALREADY_VOID"]);
    expect(voidFault(est(), "The preparer was transferred to another region.")).toEqual([]);
  });
  it("after voiding, a new preparer's version 1 is accepted", () => {
    const voided = [{ state: "VOID" as const }];
    expect(startFault(voided)).toBeNull();
    expect(blocks(versionFaults({ value: sen("1.00"), personId: "p5", reason: "" }, null, ctx()))).toEqual([]);
  });
});

describe("lodgement and the retained copy (FR-EST-007, 010)", () => {
  it("lodges the current version once; again after an amendment", () => {
    expect(lodgeFaults(est(), { personId: "p3" }, "DRAFT")).toEqual([]);
    expect(codes(lodgeFaults(est({ state: "LODGED", lodgedVersionNo: 1 }), { personId: "p3" }, "DRAFT"))).toEqual(["ALREADY_LODGED"]);
    expect(lodgeFaults(est({ state: "LODGED", lodgedVersionNo: 1, currentVersionNo: 2 }), { personId: "p3" }, "DRAFT")).toEqual([]);
    expect(codes(lodgeFaults(est({ state: "VOID" }), { personId: null }, "CANCELLED"))).toEqual(["EXERCISE_CANCELLED", "VOID", "PERSON_REQUIRED"]);
  });
  it("the retained copy: after lodgement, with its place, once per lodged version", () => {
    expect(retainFaults(est({ state: "LODGED", lodgedVersionNo: 1 }), { personId: "p3", place: "C&P safe" })).toEqual([]);
    expect(codes(retainFaults(est(), { personId: "p3", place: "C&P safe" }))).toEqual(["NOT_LODGED"]);
    expect(codes(retainFaults(est({ state: "LODGED", lodgedVersionNo: 1, retainedVersionNo: 1 }), { personId: "p3", place: "x" }))).toEqual(["ALREADY_RETAINED"]);
    expect(codes(retainFaults(est({ state: "LODGED", lodgedVersionNo: 1 }), { personId: null, place: " " }))).toEqual(["PLACE_REQUIRED", "PERSON_REQUIRED"]);
  });
  it("after re-lodgement the second copy of the new version is due and allowed; the earlier copy does not count for it", () => {
    // Version 1 lodged and its copy retained; amended to version 2 and lodged again.
    const relodged = est({ state: "LODGED", currentVersionNo: 2, lodgedVersionNo: 2, retainedVersionNo: 1 });
    expect(retainFaults(relodged, { personId: "p3", place: "C&P safe" })).toEqual([]);
    expect(retainedCopyDue(relodged)).toBe(true);
    // Before the re-lodgement (amended, lodged copy behind): the copy of the lodged version stands.
    expect(retainedCopyDue(est({ state: "LODGED", currentVersionNo: 2, lodgedVersionNo: 1, retainedVersionNo: 1 }))).toBe(false);
    expect(retainedCopyDue(est({ state: "LODGED", lodgedVersionNo: 2, retainedVersionNo: 2 }))).toBe(false);
    expect(retainedCopyDue(est({ state: "LODGED", lodgedVersionNo: 1, retainedVersionNo: null }))).toBe(true);
    expect(retainedCopyDue(est({ state: "DRAFT" }))).toBe(false);
  });
});

describe("lead time (OD-3, ASSUMED reading): the worked example", () => {
  // Lead 7 days; closing 19 November 2026 at 14:30 in Kuala Lumpur (06:30 UTC).
  const closingAt = new Date("2026-11-19T06:30:00Z");
  const policy = { estimateLeadDays: 7 };
  it("the last permitted day is 12 November", () => {
    expect(leadTime("2026-11-12", closingAt, policy, KL).lastPermittedDay).toBe("2026-11-12");
  });
  it("a last version on 12 November is READY; on 13 November it is LATE", () => {
    expect(leadTime("2026-11-12", closingAt, policy, KL).state).toBe("READY");
    expect(leadTime("2026-11-13", closingAt, policy, KL).state).toBe("LATE");
  });
  it("2026-11-12T17:30Z is 13 November in Kuala Lumpur, so LATE", () => {
    expect(leadTime(new Date("2026-11-12T17:30:00Z"), closingAt, policy, KL)).toEqual({ state: "LATE", lastPermittedDay: "2026-11-12", lastVersionDay: "2026-11-13" });
    expect(leadTime(new Date("2026-11-12T15:59:00Z"), closingAt, policy, KL).state).toBe("READY");
  });
  it("lead unset, closing null and time zone null each say so, never a guess", () => {
    expect(leadTime("2026-11-12", closingAt, { estimateLeadDays: null }, KL).state).toBe("LEAD_NOT_SET");
    expect(leadTime("2026-11-12", null, policy, KL).state).toBe("CLOSING_NOT_SET");
    expect(leadTime("2026-11-12", closingAt, policy, null).state).toBe("TIME_ZONE_NOT_SET");
    expect(leadTime(null, closingAt, policy, KL)).toEqual({ state: "NOT_PREPARED", lastPermittedDay: "2026-11-12" });
  });
  it("a lead of zero allows the closing day itself", () => {
    expect(leadTime("2026-11-19", closingAt, { estimateLeadDays: 0 }, KL).state).toBe("READY");
  });
});

describe("the late override (built for 6.7)", () => {
  it("an unset override office means no override", () => {
    expect(codes(overrideFaults({ personId: "p1", holdsOverrideRole: true, reason: "x" }, { estimateOverrideRoleCode: null }))).toEqual(["OVERRIDE_NOT_PERMITTED"]);
  });
  it("the holder of the office, with a reason", () => {
    expect(overrideFaults({ personId: "p1", holdsOverrideRole: true, reason: "Late by a day; the committee was told." }, { estimateOverrideRoleCode: "CEO" })).toEqual([]);
    expect(codes(overrideFaults({ personId: "p2", holdsOverrideRole: false, reason: "" }, { estimateOverrideRoleCode: "CEO" }))).toEqual(["NOT_HOLDER", "REASON_REQUIRED"]);
  });
});

describe("sealed until disclosure (OD-1, FR-EST-010): the worked example", () => {
  // Version 1 RM330,000.00, against a bill totalling RM317,973.70.
  const figures = sealFigures("e1", [{ versionNo: 1, value: sen("330000.00"), reason: "" }]);
  const bill = sen("317973.70");
  it("estimateView, againstBill and benchmarkRow return sealed while DRAFT or LODGED", () => {
    for (const state of ["DRAFT", "LODGED", "VOID"] as const) {
      const e = est({ state });
      expect(estimateView(e, figures)).toEqual({ sealed: true });
      expect(againstBill(estimateView(e, figures), bill)).toEqual({ sealed: true });
      expect(benchmarkRow(e, figures, { benchmarkLabelEn: "Company estimate" })).toEqual({ sealed: true });
    }
  });
  it("disclose() turns a lodged estimate DISCLOSED, and nothing else", () => {
    const at = new Date("2026-11-19T07:00:00Z");
    expect(disclose(est({ state: "LODGED" }), at)).toEqual({ ok: true, state: "DISCLOSED", disclosedAt: at });
    expect(disclose(est({ state: "DRAFT" }), at)).toEqual({ ok: false, fault: "NOT_LODGED" });
    expect(disclose(est({ state: "VOID" }), at)).toEqual({ ok: false, fault: "VOID" });
    expect(disclose(est({ state: "DISCLOSED" }), at)).toEqual({ ok: false, fault: "ALREADY_DISCLOSED" });
  });
  it("after disclosure: 330,000.00 against 317,973.70 is +12,026.30, +3.7822%", () => {
    const view = estimateView(est({ state: "DISCLOSED" }), figures);
    expect(view.sealed).toBe(false);
    const a = againstBill(view, bill);
    expect(a).toEqual({ sealed: false, bill, difference: sen("12026.30"), pct: "3.7822" });
    if (!a.sealed && a.bill != null) expect(formatSen(a.difference)).toBe("RM12,026.30");
  });
  it("below the bill reads negative; with no bill, says so", () => {
    const low = sealFigures("e1", [{ versionNo: 1, value: sen("300000.00"), reason: "" }]);
    expect(againstBill(estimateView(est({ state: "DISCLOSED" }), low), bill)).toEqual({ sealed: false, bill, difference: sen("-17973.70"), pct: "-5.6526" });
    expect(againstBill(estimateView(est({ state: "DISCLOSED" }), figures), null)).toEqual({ sealed: false, bill: null });
  });
  it("figures of another estimate, or of no current version, show nothing", () => {
    expect(estimateView(est({ state: "DISCLOSED", id: "e2" }), figures)).toEqual({ sealed: true });
    expect(estimateView(est({ state: "DISCLOSED", currentVersionNo: 2 }), figures)).toEqual({ sealed: true });
    expect(estimateView(est({ state: "DISCLOSED" }), null)).toEqual({ sealed: true });
  });
  it("benchmarkRow after disclosure: the configured label (or none set), the figure, ASSUMED (OD-8)", () => {
    expect(benchmarkRow(est({ state: "DISCLOSED" }), figures, { benchmarkLabelEn: "Company estimate" })).toEqual({ sealed: false, label: "Company estimate", value: sen("330000.00"), provenance: "ASSUMED" });
    expect(benchmarkRow(est({ state: "DISCLOSED" }), figures, { benchmarkLabelEn: null })).toMatchObject({ label: null });
  });
  it("actionResult carries codes only: no value, no reason, no data", () => {
    const f = versionFaults({ value: sen("330000.00"), personId: "p10", reason: "a reason" }, est(), ctx());
    const r = actionResult(f);
    expect(r).toEqual({ ok: false, codes: ["SECOND_PREPARER"] });
    expect(JSON.stringify(r)).not.toMatch(/330000|33000000|reason/);
    expect(actionResult([{ code: "CLOSING_NOT_SET", level: "info" }])).toEqual({ ok: true });
  });
});

// Phase 3a (FR-EST-008): custody is now wired (to who may read a disclosed figure, never to a reveal before disclosure, OD-1). The title said
// "built for sign-in, not wired"; the cases below are unchanged and the department-scoped cases that follow are new.
describe("custody (FR-EST-008, wired in Phase 3a; still no reveal before disclosure, OD-1)", () => {
  const holders = [{ personId: "p3", roleCode: "HOD_CP", from: "2024-01-01", to: null }, { personId: "p9", roleCode: "AUDIT", from: "2024-01-01", to: "2026-06-30" }];
  it("an office unset says which, never 'nobody'", () => {
    expect(custodyList({ estimateCustodianRoleCode: "HOD_CP", estimateAuditRoleCode: null }, holders, "p11", "2026-10-01")).toEqual({ state: "NOT_SET", missing: ["AUDIT"] });
  });
  it("the preparer and the holders of both offices on the day", () => {
    expect(custodyList({ estimateCustodianRoleCode: "HOD_CP", estimateAuditRoleCode: "AUDIT" }, holders, "p11", "2026-10-01")).toEqual({ state: "SET", personIds: ["p11", "p3"] });
    expect(custodyList({ estimateCustodianRoleCode: "HOD_CP", estimateAuditRoleCode: "AUDIT" }, holders, "p11", "2026-06-30")).toEqual({ state: "SET", personIds: ["p11", "p3", "p9"] });
  });
  it("nobody sees the figure before disclosure, custody or not", () => {
    const custody = custodyList({ estimateCustodianRoleCode: "HOD_CP", estimateAuditRoleCode: "AUDIT" }, holders, "p11", "2026-10-01");
    expect(viewFault("p11", est({ state: "LODGED" }), custody)).toBe("SEALED");
    expect(viewFault("p11", est({ state: "DISCLOSED" }), custody)).toBeNull();
    expect(viewFault("p4", est({ state: "DISCLOSED" }), custody)).toBe("NOT_IN_CUSTODY");
    expect(viewFault("p11", est({ state: "DISCLOSED" }), { state: "NOT_SET", missing: ["AUDIT"] })).toBe("CUSTODY_NOT_SET");
  });
  describe("where an office is held (Phase 3a: a department's head does not hold every department's estimate)", () => {
    const scoped = [
      { personId: "hodA", roleCode: "HOD_CP", scope: "DEPT_A", from: "2024-01-01", to: null },
      { personId: "hodB", roleCode: "HOD_CP", scope: "DEPT_B", from: "2024-01-01", to: null },
      { personId: "hodAll", roleCode: "HOD_CP", scope: null, from: "2024-01-01", to: null },
      { personId: "aud", roleCode: "AUDIT", scope: null, from: "2024-01-01", to: null },
    ];
    const policy = { estimateCustodianRoleCode: "HOD_CP", estimateAuditRoleCode: "AUDIT" };
    it("the nearest unit on the path that has a holder wins, and another department's holder does not count", () => {
      expect(custodyList(policy, scoped, "p11", "2026-10-01", ["SECTION_A1", "DEPT_A", "ROOT"])).toEqual({ state: "SET", personIds: ["p11", "hodA", "aud"] });
      expect(custodyList(policy, scoped, "p11", "2026-10-01", ["DEPT_B", "ROOT"])).toEqual({ state: "SET", personIds: ["p11", "hodB", "aud"] });
    });
    it("a unit with no holder of its own falls back to the organisation-wide holders", () => {
      expect(custodyList(policy, scoped, "p11", "2026-10-01", ["DEPT_C", "ROOT"])).toEqual({ state: "SET", personIds: ["p11", "hodAll", "aud"] });
    });
    it("an empty path (the unit is not known) counts the organisation-wide holders only", () => {
      expect(custodyList(policy, scoped, "p11", "2026-10-01", [])).toEqual({ state: "SET", personIds: ["p11", "hodAll", "aud"] });
    });
    it("a holder whose spell has ended, or not begun, does not count", () => {
      const spells = [{ personId: "old", roleCode: "HOD_CP", scope: null, from: "2020-01-01", to: "2023-12-31" }, { personId: "new", roleCode: "HOD_CP", scope: null, from: "2027-01-01", to: null }, { personId: "aud", roleCode: "AUDIT", scope: null, from: "2024-01-01", to: null }];
      expect(custodyList(policy, spells, "p11", "2026-10-01", [])).toEqual({ state: "SET", personIds: ["p11", "aud"] });
    });
    it("with no path given, scope is not considered (the original behaviour)", () => {
      expect(custodyList(policy, scoped, "p11", "2026-10-01").state).toBe("SET");
      expect((custodyList(policy, scoped, "p11", "2026-10-01") as { personIds: string[] }).personIds).toEqual(["p11", "hodA", "hodB", "hodAll", "aud"]);
    });
  });
});

describe("classification (FR-EST-008): SULIT, never lowered", () => {
  it("an attempt to set the estimate below SULIT is refused via lowers()", () => {
    expect(classificationFault("SULIT", "INTERNAL")).toEqual({ code: "CLASSIFICATION_LOWERED", level: "block", data: { from: "SULIT", to: "INTERNAL" } });
    expect(classificationFault("SULIT", "PUBLIC")?.code).toBe("CLASSIFICATION_LOWERED");
    expect(classificationFault("SULIT", "SULIT")).toBeNull();
  });
  it("the unset policy has no figure-shaped default", () => {
    expect(UNSET_SCOPE_POLICY.estimateLeadDays).toBeNull();
    expect(UNSET_SCOPE_POLICY.estimateOverrideRoleCode).toBeNull();
  });
});

describe("figureReaderOf: who is named when the figure is read (ruling 20ch)", () => {
  it("names a staff person with the session and address", () => {
    expect(figureReaderOf({ kind: "STAFF", personId: "p1", sessionId: "s1", offices: [], sourceAddress: "10.0.0.1" }, "o1")).toEqual({ organisationId: "o1", personId: "p1", sessionId: "s1", sourceAddress: "10.0.0.1" });
    expect(figureReaderOf({ kind: "STAFF", personId: "p1", sessionId: null, offices: [], sourceAddress: null }, "o1")).toEqual({ organisationId: "o1", personId: "p1", sessionId: null, sourceAddress: null });
  });
  it("names a loader by its label alone", () => {
    expect(figureReaderOf({ kind: "SYSTEM", label: "loader" }, "o1")).toEqual({ organisationId: "o1", systemLabel: "loader" });
  });
  it("throws for a supplier", () => {
    expect(() => figureReaderOf({ kind: "SUPPLIER", supplierAccountId: "a1", sessionId: null, sourceAddress: null }, "o1")).toThrow();
  });
});
