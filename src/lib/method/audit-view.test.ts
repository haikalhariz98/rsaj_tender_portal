import { describe, expect, it } from "vitest";

import { auditCreate, auditPair } from "./audit-view";

const dec = (s: string) => ({ toFixed: () => s, toString: () => s });
const row = {
  id: "x1", authorityMatrixId: "mx1", matrixLabel: "Limits, issue 1", boundaryValue: dec("300000"), estimatedValue: dec("62000"), dominantSharePct: dec("100"),
  title: "Pumps", appointmentRuleKey: "q1", termsBandKey: "short", scopeParts: [{ id: "p" }], bandSnapshot: { appointment: { ruleLabel: "Quotation, up to RM300,000" }, terms: { label: "Short form" } },
};

describe("an exercise as the trail records it (UX 4, ruling on BD-16)", () => {
  it("names the matrix issue by label and the boundary as money, never an id", () => {
    const c = auditCreate(row, { requisition: "REQ/1" });
    const f = Object.fromEntries(c.map((x) => [x.field, x.after]));
    expect(f.approvalMatrixIssue).toBe("Limits, issue 1");
    expect(f.boundaryValue).toBe("300000.00");
    expect(f.appointmentRule).toBe("Quotation, up to RM300,000");
    expect(c.map((x) => x.field)).not.toContain("authorityMatrixId");
    expect(c.map((x) => x.field)).not.toContain("scopeParts");
    expect(JSON.stringify(c)).not.toMatch(/mx1/);
  });
  it("records a change of issue with unchanged keys, and nothing when nothing moved", () => {
    const later = { ...row, authorityMatrixId: "mx2", matrixLabel: "Limits, issue 2", boundaryValue: "300000.00", estimatedValue: "62000.00", dominantSharePct: "100.0000" };
    expect(auditPair(row, later)).toEqual([{ field: "approvalMatrixIssue", before: "Limits, issue 1", after: "Limits, issue 2" }]);
    expect(auditPair(row, { ...row, estimatedValue: "62000", boundaryValue: "300000" })).toEqual([]);
    // The lib hands the share and boundary back as numbers.
    expect(auditPair(row, { ...row, dominantSharePct: 100, boundaryValue: 300000 })).toEqual([]);
  });
  it("records a moved boundary as money", () => {
    const moved = auditPair(row, { ...row, authorityMatrixId: "mx2", boundaryValue: "250000" });
    expect(moved).toContainEqual({ field: "boundaryValue", before: "300000.00", after: "250000.00" });
  });
});

describe("the rule and band are compared on their keys, shown by label (6.3 re-review)", () => {
  it("records a new key under the same label, and ignores a relabel under the same key", () => {
    const sameLabel = auditPair(row, { ...row, appointmentRuleKey: "q2" });
    expect(sameLabel).toHaveLength(1);
    expect(sameLabel[0].field).toBe("appointmentRule");
    expect(sameLabel[0].before).toBe("Quotation, up to RM300,000");
    expect(sameLabel[0].after).not.toBe(sameLabel[0].before);
    expect(sameLabel[0].after).not.toMatch(/q2/);
    const relabelled = { ...row, bandSnapshot: { appointment: { ruleLabel: "Renamed" }, terms: { label: "Short form" } } };
    expect(auditPair(row, relabelled)).toEqual([]);
  });
  it("records a terms band coming or going", () => {
    expect(auditPair(row, { ...row, termsBandKey: null })).toEqual([{ field: "termsBand", before: "Short form", after: null }]);
  });
});
