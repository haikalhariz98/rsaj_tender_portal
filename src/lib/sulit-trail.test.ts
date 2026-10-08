import { describe, expect, it } from "vitest";

import { auditCsv, SULIT_WITHHELD } from "@/lib/audit/export";
import { itemAudit } from "@/lib/scope/audit-view";
import { parseSen } from "@/lib/money";

import { sulitFieldOf } from "./sulit-trail";

/**
 * Which registered SULIT field a stored change is (Phase 3b): a specific key is itself, and the older generic keys of four writers are read by entity, so the rows
 * already in the trail are judged and withheld as the field they are.
 */
describe("sulitFieldOf", () => {
  it("a registered key is itself, whatever the entity", () => {
    expect(sulitFieldOf("OpenedBid", "openingPrice")).toBe("openingPrice");
    expect(sulitFieldOf("RequisitionBudgetCheck", "requestedAmount")).toBe("requestedAmount");
    expect(sulitFieldOf("RequisitionBudgetCheck", "projectedBalance")).toBe("projectedBalance");
  });
  it("the older generic keys are the field they were: a bill's rate and amount, its finalising totals, a matter's amount, a scope part's amount", () => {
    expect(sulitFieldOf("BqItem", "rate")).toBe("bqRate");
    expect(sulitFieldOf("BqItem", "amount")).toBe("bqAmount");
    expect(sulitFieldOf("BqVersion", "total")).toBe("bqTotals");
    expect(sulitFieldOf("BqVersion", "buildersWorks")).toBe("bqBuildersWorks");
    expect(sulitFieldOf("BqVersion", "firmValue")).toBe("bqFirmValue");
    expect(sulitFieldOf("CommitteeDecision", "amount")).toBe("matterAmount");
    expect(sulitFieldOf("ExerciseScopePart", "amount")).toBe("estimatedValue");
  });
  it("a generic key on another kind of record is not a SULIT field: an addendum's or a sale's amount", () => {
    expect(sulitFieldOf("DocumentSale", "amount")).toBeNull();
    expect(sulitFieldOf("BqItem", "description")).toBeNull();
    expect(sulitFieldOf("Anything", "rate")).toBeNull();
  });
});

describe("the bill's new rows use the registered keys, and the audit export withholds both the new and the older rows", () => {
  it("itemAudit writes bqRate and bqAmount, not rate and amount", () => {
    const rows = itemAudit(null, { itemRef: "B", description: "Pipe", unit: "m", kind: "MEASURED", quantity: "10", rate: parseSen("12.34"), provisional: false });
    const fields = rows.map((r) => r.field);
    expect(fields).toContain("bqRate");
    expect(fields).toContain("bqAmount");
    expect(fields).not.toContain("rate");
    expect(fields).not.toContain("amount");
  });
  it("a row from before reads as the same fields in the export: nothing of the figure leaves", () => {
    const row = (entity: string, changes: { field: string; before: unknown; after: unknown }[]) => ({ id: `e_${entity}`, at: new Date("2026-10-02T02:00:00Z"), entity, entityId: "x", entityLabel: "DEMO/SX/1 · Bill of quantities", action: "CREATE" as const, changes, actorName: "A", reason: "" });
    const csv = auditCsv(
      [
        row("BqItem", [{ field: "rate", before: null, after: "RM1,840.00" }, { field: "amount", before: null, after: "RM118,680.00" }, { field: "description", before: null, after: "Excavate" }]),
        row("CommitteeDecision", [{ field: "amount", before: null, after: "RM250,000.00" }, { field: "subject", before: null, after: "Gate" }]),
      ] as never,
      "Asia/Kuala_Lumpur",
    );
    for (const leak of ["1,840.00", "118,680.00", "250,000.00"]) expect(csv, leak).not.toContain(leak);
    expect(csv).toContain("Excavate");
    expect(csv).toContain("Gate");
    expect(csv.split(SULIT_WITHHELD).length - 1).toBe(3);
  });
});
