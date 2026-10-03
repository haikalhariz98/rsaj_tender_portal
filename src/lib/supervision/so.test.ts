import { describe, expect, it } from "vitest";

import { DAL_FIXTURE } from "@/lib/authority/dal-fixture";
import type { Matrix, Rule } from "@/lib/authority/types";

import { supervisionFaultWords } from "./labels";
import { assignmentToMove, reResolveReading, resolveActFaults, resolveSo, SO_DOMAIN, soFaults, soOn } from "./so";

/**
 * FOR TESTS ONLY (never seeded, never imported by the product): the specification's FR-SUP-001 bands as
 * `superintending_officer` rows on the Appendix B fixture: the CEO above RM3 million, the Functional Director
 * above RM1 million up to RM3 million, the Head of Division above RM300,000 up to RM1 million, and the Head of
 * Division throughout the quotation regime (DAL §3.1.4.4 item 5, §3.1.4.3 item 6). Rule 1: on a customer's
 * system these are matrix rows, never code.
 */

const base = DAL_FIXTURE.rules.find((r) => r.domain === "signing")!;
const so = (r: Partial<Rule> & Pick<Rule, "ruleKey">): Rule => ({ ...base, domain: SO_DOMAIN, recommenders: [], proposerCode: null, generateCoreChain: false, coreChainReason: "test", minValue: null, maxValue: null, contractValueMin: null, contractValueMax: null, followsBoundarySwitch: true, ...r });

const SO_RULES: Rule[] = [
  so({ ruleKey: "SO_T_ABOVE_3M", method: "tender", contractValueMin: 3_000_000, approverCode: "CEO", clause: "§3.1.4.4 item 5a" }),
  so({ ruleKey: "SO_T_1M_TO_3M", method: "tender", contractValueMin: 1_000_000, contractValueMax: 3_000_000, approverCode: "FD", clause: "§3.1.4.4 item 5b" }),
  so({ ruleKey: "SO_T_300K_TO_1M", method: "tender", contractValueMin: 300_000, contractValueMax: 1_000_000, approverCode: "HODIV", clause: "§3.1.4.4 item 5c" }),
  so({ ruleKey: "SO_QUOTATION", method: "quotation", approverCode: "HODIV", clause: "§3.1.4.3 item 6" }),
];

const SO_MATRIX: Matrix = { ...DAL_FIXTURE, rules: [...DAL_FIXTURE.rules, ...SO_RULES] };


/**
 * FR-SUP-001: the S.O. resolved as an office from the matrix's rows by contract value and regime. Worked
 * examples (figures from the specification; rows a test-only fixture):
 * - RSAJ/KP/T/02/2026, a tender at RM1,077,508.60 → Functional Director (above RM1 million, up to RM3 million).
 * - Exactly RM300,000.00 → Head of Division under both readings of D3: with the boundary in the lower band the
 *   contract is in the quotation regime (Head of Division throughout); with it in the upper, the tender row
 *   above RM300,000 up to RM1 million is the Head of Division too.
 * - A quotation at any value → Head of Division.
 * - No row → SO_UNRESOLVED, naming the matrix.
 */

const tender = (v: number) => resolveSo(SO_MATRIX, { contractValue: v, method: "tender", contractTypeCode: null });

describe("the worked examples", () => {
  it("RSAJ/KP/T/02/2026 at RM1,077,508.60 resolves to the Functional Director", () => {
    expect(tender(1_077_508.6)).toMatchObject({ state: "RESOLVED", roleCode: "FD", clause: "§3.1.4.4 item 5b" });
  });
  it("RM300,000.00 is the Head of Division under both D3 settings", () => {
    for (const boundaryInclusive of [true, false]) {
      const m = { ...SO_MATRIX, policy: { ...SO_MATRIX.policy, boundaryInclusive } };
      const method = boundaryInclusive ? "quotation" : "tender";
      expect(resolveSo(m, { contractValue: 300_000, method, contractTypeCode: null }), String(boundaryInclusive)).toMatchObject({ state: "RESOLVED", roleCode: "HODIV" });
    }
  });
  it("the quotation regime is the Head of Division throughout", () => {
    for (const v of [15_000, 100_000, 299_999.99]) expect(resolveSo(SO_MATRIX, { contractValue: v, method: "quotation", contractTypeCode: null })).toMatchObject({ roleCode: "HODIV" });
  });
  it("the bands' edges: RM1,000,000.00 is the Head of Division, a sen above the Functional Director; above RM3 million the CEO", () => {
    expect(tender(1_000_000)).toMatchObject({ roleCode: "HODIV" });
    expect(tender(1_000_000.01)).toMatchObject({ roleCode: "FD" });
    expect(tender(3_000_000)).toMatchObject({ roleCode: "FD" });
    expect(tender(3_000_000.01)).toMatchObject({ roleCode: "CEO" });
  });
  it("no row: SO_UNRESOLVED, refused, naming the matrix", () => {
    const r = resolveSo(DAL_FIXTURE, { contractValue: 1_077_508.6, method: "tender", contractTypeCode: null });
    expect(r.state).toBe("SO_UNRESOLVED");
    const f = soFaults(r, "Demo limits, issue 1");
    expect(f.map((x) => x.code)).toEqual(["SO_UNRESOLVED"]);
    expect(supervisionFaultWords(f[0]).en).toMatch(/^No superintending-officer rule on the approval matrix \(Demo limits, issue 1\)/);
    expect(supervisionFaultWords(f[0]).en).toMatch(/the S\.O\. is never keyed\.$/);
  });
});

describe("the office in force on a day, and every holder kept", () => {
  const rows = [
    { id: "a", roleCode: "HODIV", roleLabel: "Head of Division", effectiveOn: "2026-03-02", recordedAt: new Date("2026-03-02T02:00:00Z") },
    { id: "b", roleCode: "FD", roleLabel: "Functional Director", effectiveOn: "2026-08-01", recordedAt: new Date("2026-08-01T02:00:00Z") },
  ];
  it("the latest effective on or before the day", () => {
    expect(soOn(rows, "2026-03-01")).toBeNull();
    expect(soOn(rows, "2026-03-02")?.id).toBe("a");
    expect(soOn(rows, "2026-07-31")?.id).toBe("a");
    expect(soOn(rows, "2026-08-01")?.id).toBe("b");
  });
  it("the one-off resolution: an executed contract with none yet", () => {
    expect(resolveActFaults({ executed: false, assignments: 0 }).map((f) => f.code)).toEqual(["NOT_EXECUTED"]);
    expect(resolveActFaults({ executed: true, assignments: 1 }).map((f) => f.code)).toEqual(["ALREADY_RESOLVED"]);
    expect(resolveActFaults({ executed: true, assignments: 0 })).toEqual([]);
  });
  it("review 1: the one-off resolution is recorded with its reason (it takes effect from the Contract Date)", () => {
    expect(resolveActFaults({ executed: true, assignments: 0, reason: "  " }).map((f) => f.code)).toEqual(["REASON_REQUIRED"]);
    expect(resolveActFaults({ executed: true, assignments: 0, reason: "Executed before supervision was recorded." })).toEqual([]);
  });
  it("OD-A7: the re-resolve switch reads on, off or not set (never 'no' for unset)", () => {
    expect(reResolveReading(null).state).toBe("NOT_SET");
    expect(reResolveReading(true).state).toBe("ON");
    expect(reResolveReading(false).state).toBe("OFF");
  });
});

describe("review 4: the S.O. is resolved on the method's authority key, as every engine caller passes it", () => {
  const direct = so({ ruleKey: "SO_DIRECT", method: "direct", approverCode: "FD", clause: "test" });
  const m: Matrix = { ...DAL_FIXTURE, rules: [...DAL_FIXTURE.rules, direct] };
  it("a row confined to a method key applies to that key only", () => {
    expect(resolveSo(m, { contractValue: 10_000, method: "direct", contractTypeCode: null })).toMatchObject({ state: "RESOLVED", ruleKey: "SO_DIRECT" });
    expect(resolveSo(m, { contractValue: 10_000, method: "tender", contractTypeCode: null }).state).toBe("SO_UNRESOLVED");
    expect(resolveSo(m, { contractValue: 10_000, method: null, contractTypeCode: null }).state).toBe("SO_UNRESOLVED");
  });
});

describe("review 1: correcting the Contract Date moves the assignment that took effect on it", () => {
  const rows = [
    { id: "x", reason: "EXECUTION", effectiveOn: "2026-09-30" },
    { id: "y", reason: "RE_RESOLVED", effectiveOn: "2026-12-01" },
  ];
  it("the signature's (or the one-off resolution's) assignment on the old Contract Date moves", () => {
    expect(assignmentToMove(rows, "2026-09-30", "2026-09-28")?.id).toBe("x");
    expect(assignmentToMove([{ id: "z", reason: "RESOLVED", effectiveOn: "2026-09-30" }], "2026-09-30", "2026-09-28")?.id).toBe("z");
  });
  it("a later assignment never moves; nothing on the old day, or no change, moves nothing", () => {
    expect(assignmentToMove([rows[1]], "2026-12-01", "2026-11-30")).toBeNull();
    expect(assignmentToMove(rows, "2026-10-01", "2026-09-28")).toBeNull();
    expect(assignmentToMove(rows, "2026-09-30", "2026-09-30")).toBeNull();
    expect(assignmentToMove(rows, null, "2026-09-30")).toBeNull();
  });
});

describe("an S.O. row banded on the matter's value (as the rule editor sets it) is read too", () => {
  it("the contract's value is passed as both the contract value and the matter's value", () => {
    const banded = so({ ruleKey: "SO_VALUE_BAND", method: null, cond: null, pctMin: null, pctMax: null, maxValue: 50_000, approverCode: "FD", clause: "test" });
    const m: Matrix = { ...DAL_FIXTURE, rules: [...DAL_FIXTURE.rules, banded] };
    expect(resolveSo(m, { contractValue: 36_000, method: null, contractTypeCode: null })).toMatchObject({ state: "RESOLVED", ruleKey: "SO_VALUE_BAND" });
    expect(resolveSo(m, { contractValue: 60_000, method: null, contractTypeCode: null }).state).toBe("SO_UNRESOLVED");
  });
});
