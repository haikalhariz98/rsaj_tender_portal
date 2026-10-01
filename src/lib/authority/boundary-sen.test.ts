import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { bandingNumber } from "@/lib/method/bands";
import { amountOf, parseSen } from "@/lib/money";

import { DAL_FIXTURE } from "./dal-fixture";
import { regimeFor, resolveApproval } from "./resolve";
import type { Matrix, Rule } from "./types";

/**
 * Ruling C6: one sen either side of every threshold that decides an authority, through
 * the converters the product actually uses — a Decimal read from the database
 * (`amountOf`, as `authority/load.ts` and the requisition repo read values and band
 * edges) and sen typed on a form (`bandingNumber`, as the exercise and the award do).
 * Had any of these failed, the engine would move to sen; none does.
 */

const D = (v: string) => new Prisma.Decimal(v);

/// The fixture as `load.ts` builds it: every edge and threshold through a stored Decimal.
function loaded(m: Matrix, boundaryInclusive: boolean): Matrix {
  const edge = (n: number | null) => (n == null ? null : amountOf(D(n.toFixed(2))));
  return {
    ...m,
    policy: {
      ...m.policy,
      boundaryInclusive,
      boundaryValue: amountOf(D(m.policy.boundaryValue.toFixed(2))),
      quotationFloor: amountOf(D(m.policy.quotationFloor.toFixed(2))),
      tenderFloor: amountOf(D(m.policy.tenderFloor.toFixed(2))),
    },
    rules: m.rules.map((r): Rule => ({ ...r, minValue: edge(r.minValue), maxValue: edge(r.maxValue), contractValueMin: edge(r.contractValueMin), contractValueMax: edge(r.contractValueMax) })),
  };
}

const ABOVE = loaded(DAL_FIXTURE, true); // "more than RM300K": exactly RM300,000.00 sits below
const AT_OR_ABOVE = loaded(DAL_FIXTURE, false); // ">= RM300,000.00": exactly on it sits above

/// Both ways a value reaches the engine: a stored Decimal, and sen typed on a form.
const throughBoth = (text: string) => [amountOf(D(text)), bandingNumber(parseSen(text))];
const approver = (m: Matrix, domain: string, method: string | null, value: number) => resolveApproval(m, { domain, method, value }).approverCode;

describe("one sen either side of each threshold (C6)", () => {
  it("RM15,000.00 is the Functional Director's direct purchase; RM15,000.01 the CEO's, on the Quotation Committee's MR", () => {
    for (const v of throughBoth("15000.00")) expect(approver(ABOVE, "appointment", "direct", v)).toBe("FD");
    for (const v of throughBoth("15000.01")) {
      expect(approver(ABOVE, "appointment", "direct", v)).toBe("CEO");
      expect(resolveApproval(ABOVE, { domain: "appointment", method: "direct", value: v }).chain.map((s) => s.roleCode)).toContain("QC");
    }
    for (const v of throughBoth("15000.00")) expect(regimeFor(v, ABOVE.policy)).toBe("below");
    for (const v of throughBoth("15000.01")) expect(regimeFor(v, ABOVE.policy)).toBe("quotation");
  });

  it("RM300,000.00 under D3 set to “more than”: below the boundary — quotation, the CEO; RM300,000.01: tender, the Tender Board", () => {
    for (const v of throughBoth("300000.00")) {
      expect(regimeFor(v, ABOVE.policy)).toBe("quotation");
      expect(approver(ABOVE, "appointment", "open_selective", v)).toBe("CEO");
    }
    for (const v of throughBoth("300000.01")) {
      expect(regimeFor(v, ABOVE.policy)).toBe("tender");
      expect(approver(ABOVE, "appointment", "open_selective", v)).toBe("TBC");
    }
  });

  it("RM300,000.00 under D3 set to “at or above”: on the boundary — tender, the Tender Board; RM299,999.99 stays quotation", () => {
    for (const v of throughBoth("300000.00")) {
      expect(regimeFor(v, AT_OR_ABOVE.policy)).toBe("tender");
      expect(approver(AT_OR_ABOVE, "appointment", "open_selective", v)).toBe("TBC");
    }
    for (const v of throughBoth("300000.01")) expect(approver(AT_OR_ABOVE, "appointment", "open_selective", v)).toBe("TBC");
    for (const v of throughBoth("299999.99")) expect(approver(AT_OR_ABOVE, "appointment", "open_selective", v)).toBe("CEO");
  });

  it("a requisition at RM300,000.00 goes to the Functional Director under both D3 settings; RM300,000.01 to the CEO (requisition bands do not follow the switch)", () => {
    for (const m of [ABOVE, AT_OR_ABOVE]) {
      for (const v of throughBoth("300000.00")) expect(approver(m, "requisition", null, v)).toBe("FD");
      for (const v of throughBoth("300000.01")) expect(approver(m, "requisition", null, v)).toBe("CEO");
    }
  });

  it("RM500,000.00 is the Functional Director's interim payment; RM500,000.01 the CEO's", () => {
    for (const m of [ABOVE, AT_OR_ABOVE]) {
      for (const v of throughBoth("500000.00")) expect(approver(m, "payment", "tender", v)).toBe("FD");
      for (const v of throughBoth("500000.01")) expect(approver(m, "payment", "tender", v)).toBe("CEO");
    }
  });
});
