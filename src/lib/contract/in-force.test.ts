import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { legalOfficeKnown, preparationSettings, rowInForce } from "./in-force";

/**
 * 6.12 review R-6: a document part or copy recipient "retired from" a day was treated as retired the
 * moment any day was set. Now it is compared with the organisation's day, the end exclusive.
 */

describe("a row retired from a day", () => {
  const row = { retiredOn: dayToDate("2026-10-15") };
  it("is in force the day before", () => expect(rowInForce(row, "2026-10-14")).toBe(true));
  it("is not in force on the day itself (exclusive end)", () => expect(rowInForce(row, "2026-10-15")).toBe(false));
  it("is not in force after", () => expect(rowInForce(row, "2026-11-01")).toBe(false));
  it("a row never retired is in force", () => expect(rowInForce({ retiredOn: null }, "2026-10-15")).toBe(true));
});

describe("the legal office", () => {
  const units = [
    { code: "LEGAL", effectiveTo: null },
    { code: "OLD_LEGAL", effectiveTo: dayToDate("2026-10-15") },
  ];
  it("a unit in force is known; one whose end has come is not; none set is not", () => {
    expect(legalOfficeKnown("LEGAL", units, "2026-10-02")).toBe(true);
    expect(legalOfficeKnown("OLD_LEGAL", units, "2026-10-14")).toBe(true);
    expect(legalOfficeKnown("OLD_LEGAL", units, "2026-10-15")).toBe(false);
    expect(legalOfficeKnown(null, units, "2026-10-02")).toBe(false);
    expect(legalOfficeKnown("NOWHERE", units, "2026-10-02")).toBe(false);
  });
});

describe("what preparation starts from, on the organisation's day", () => {
  const cfg = {
    policy: { legalOfficeCode: "LEGAL", signatoryCond: "CONTRACT_AGREEMENT", controlledCopyStampEn: "CONTROLLED COPY", controlledCopyStampMs: null, frontLoadingRatio: null, provenance: null },
    parts: [
      { contractBasisCode: "BQ", retiredOn: null },
      { contractBasisCode: "BQ", retiredOn: dayToDate("2026-10-15") },
      { contractBasisCode: "BQ", retiredOn: dayToDate("2026-10-01") },
      { contractBasisCode: "SOR", retiredOn: null },
    ],
    recipients: [{ retiredOn: dayToDate("2026-10-15") }, { retiredOn: dayToDate("2026-10-02") }],
    units: [{ code: "LEGAL", nameEn: "Legal Office", effectiveTo: null }],
    bases: [{ code: "BQ", nameEn: "Bill of quantities", requiresBq: true }],
  };
  it("a part or recipient retired from a later day is still taken; from today or earlier it is not", () => {
    const s = preparationSettings(cfg, "BQ", "2026-10-02");
    expect(s.parts).toHaveLength(2);
    expect(s.recipients).toHaveLength(1);
    expect(s.legalOfficeKnown).toBe(true);
    expect(s.office?.nameEn).toBe("Legal Office");
    expect(s.basis?.code).toBe("BQ");
  });
  it("the start act, the Overview and Configuration all read it, and none compares retiredOn with null to decide", () => {
    const read = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");
    expect(read("src/app/projects/[id]/actions.ts")).toContain("preparationSettings(");
    expect(read("src/app/projects/[id]/page.tsx")).toContain("preparationSettings(");
    expect(read("src/app/configuration/contracts/page.tsx")).toContain("rowInForce(");
    for (const p of ["src/app/projects/[id]/actions.ts", "src/app/projects/[id]/page.tsx", "src/app/configuration/contracts/page.tsx"]) {
      expect(read(p), p).not.toMatch(/retiredOn == null|!\w+\.retiredOn\)/);
    }
  });
});
