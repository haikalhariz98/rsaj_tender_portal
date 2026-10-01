import { describe, expect, it } from "vitest";

import { awardAuditCreate, awardAuditPair } from "./audit-view";

describe("the award's trail", () => {
  it("never holds an IC number in full", () => {
    const changes = awardAuditPair({ icNumber: "" }, { icNumber: "000000-00-0001" });
    expect(changes).toEqual([{ field: "icNumber", before: "", after: "••••••••0001" }]);
    expect(JSON.stringify(awardAuditCreate({ icNumber: "000000-00-0001" }))).not.toContain("000000-00");
  });
  it("records a changed IC number even when its last four digits are the same, still masked", () => {
    const changes = awardAuditPair({ icNumber: "111111-11-1234" }, { icNumber: "222222-22-1234" });
    expect(changes).toEqual([{ field: "icNumber", before: "••••••••1234", after: "changed (••••••••1234)" }]);
    expect(JSON.stringify(changes)).not.toMatch(/111111|222222/);
    expect(awardAuditPair({ icNumber: "111111-11-1234" }, { icNumber: " 111111-11-1234 " })).toEqual([]);
  });
  it("an unchanged amount written differently is no change", () => {
    expect(awardAuditPair({ awardedValue: "2100000" }, { awardedValue: "2100000.00" })).toEqual([]);
    expect(awardAuditPair({ bondPercent: "5" }, { bondPercent: "5.0000" })).toEqual([]);
  });
  it("leaves out ids and snapshots", () => {
    expect(awardAuditCreate({ id: "x", exerciseId: "y", issueSnapshot: { a: 1 }, reference: "A/1" })).toEqual([{ field: "reference", before: null, after: "A/1" }]);
  });
});
