import { describe, expect, it } from "vitest";

import { DAL_FIXTURE } from "@/lib/authority/dal-fixture";
import type { Matrix } from "@/lib/authority/types";
import { parseSen } from "@/lib/money";

import { EOT_COND, eotCondOf, resolveMatterRoute } from "./route";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * 6.13 Part B run 1b: a contract matter's route on the matrix (FR-EOT-007, worked example 11; FR-LAD-009, example 12).
 * The matrix is the test-only Appendix B fixture: no row ships (Rule 1). BD-613-132: the EOT's conditions.
 */

const ctx = (dal: Matrix = DAL_FIXTURE) => ({ dal, override: null, supersedes: false });
const chain = (r: ReturnType<typeof resolveMatterRoute>) => (r.ok ? r.resolution.chain.map((s) => `${s.roleCode}:${s.act}`) : r.faults.map((f) => f.code));
const base = { value: null, ratio: null, contractValue: parseSen("9000000.00"), method: "tender", contractTypeCode: null };

describe("FR-EOT-007: an EOT routes on the cause of its financial impact, never its value (BD-613-132)", () => {
  it("the three branches, as conditions the matrix's rows name", () => {
    expect(EOT_COND).toEqual({ OTHER: "financial_not_authority", AUTHORITY_REQUIREMENT: "financial_authority", NONE: "no_financial_impact" });
    expect(eotCondOf("OTHER")).toBe("financial_not_authority");
  });

  it("example 11: financial impact not due to an authority requirement → VOC MR → Tender Board A", () => {
    expect(chain(resolveMatterRoute(ctx(), { ...base, kind: "EOT", cond: eotCondOf("OTHER") }, "fixture", () => false))).toEqual(["VOC:MR", "TBC:A"]);
  });

  it("due to an authority requirement → VOC MR → CEO A", () => {
    expect(chain(resolveMatterRoute(ctx(), { ...base, kind: "EOT", cond: eotCondOf("AUTHORITY_REQUIREMENT") }, "fixture", () => false))).toEqual(["VOC:MR", "CEO:A"]);
  });

  it("no financial impact: the fixture has no row, so it is refused naming the matrix (rows ship empty; D2 is the customer's)", () => {
    const r = resolveMatterRoute(ctx(), { ...base, kind: "EOT", cond: eotCondOf("NONE") }, "Issue A", () => false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.faults[0].code).toBe("NO_RULE");
      expect(r.faults[0].data).toMatchObject({ matrix: "Issue A", domain: "eot" });
    }
  });

  // Deliberate change (RSAJ answers stage 2, B2): the D2 note naming SK006 and the DAL is gone; the conflict is a route choice on the matrix.
  it("an EOT route carries no fixed note on decision D2", () => {
    const r = resolveMatterRoute(ctx(), { ...base, kind: "EOT", cond: eotCondOf("OTHER") }, "fixture", () => false);
    expect(r.ok && r.notes).toEqual([]);
  });
});

describe("FR-LAD-009 worked example 12: a waiver routes at the exact ratio waived ÷ LAD amount (percent-band.ts)", () => {
  const waiver = (num: string, inclusive: boolean) => resolveMatterRoute(ctx({ ...DAL_FIXTURE, policy: { ...DAL_FIXTURE.policy, boundaryInclusive: inclusive } }), { ...base, kind: "LAD_WAIVER", ratio: { num: parseSen(num), den: parseSen("8081.40") } }, "fixture", () => false);
  it("40% (3,232.56 of 8,081.40) → Tender Board; 25% (2,020.35) → CEO", () => {
    expect(chain(waiver("3232.56", true))).toEqual(["TBC:A"]);
    expect(chain(waiver("2020.35", true))).toEqual(["CEO:A"]);
  });
  it("BD-613-102: exactly 30.00% (2,424.42) goes where the fixture's boundaryInclusive puts it; both values tested", () => {
    expect(chain(waiver("2424.42", true))).toEqual(["CEO:A"]);
    expect(chain(waiver("2424.42", false))).toEqual(["TBC:A"]);
    expect(chain(waiver("2424.43", true))).toEqual(["TBC:A"]);
    expect(chain(waiver("2424.43", false))).toEqual(["TBC:A"]);
  });
});

describe("the sender's own office escalates (self-approval), as every route does", () => {
  it("a sender holding the approving office moves the approval up", () => {
    const r = resolveMatterRoute(ctx(), { ...base, kind: "LAD_WAIVER", ratio: { num: parseSen("2020.35"), den: parseSen("8081.40") } }, "fixture", (code) => code === "CEO");
    expect(r.ok && r.resolution.approverCode).not.toBe("CEO");
  });
});
