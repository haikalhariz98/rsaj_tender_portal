import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { legalOfficeKnown, preparationSettings, rowInForce, unitInForce } from "./in-force";

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
    { code: "LEGAL", effectiveFrom: dayToDate("2024-01-01"), effectiveTo: null },
    { code: "OLD_LEGAL", effectiveFrom: dayToDate("2024-01-01"), effectiveTo: dayToDate("2026-10-15") },
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
    units: [{ code: "LEGAL", nameEn: "Legal Office", effectiveFrom: dayToDate("2024-01-01"), effectiveTo: null }],
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

/**
 * 6.12 re-review M-2: the legal office was looked up as the first row with its code, in force or not, and
 * its start was ignored. A unit renamed by a new row froze its old name; a unit starting tomorrow passed.
 */
describe("the legal office's row in force on the day (M-2)", () => {
  const renamed = [
    // Loaded oldest first on purpose: the lookup must not take the first row with the code.
    { code: "LEGAL", nameEn: "Legal Unit", effectiveFrom: dayToDate("2024-01-01"), effectiveTo: dayToDate("2026-10-01") },
    { code: "LEGAL", nameEn: "Legal Office", effectiveFrom: dayToDate("2026-10-01"), effectiveTo: null },
  ];
  it("a renamed unit: the name in force that day is the one frozen", () => {
    expect(unitInForce("LEGAL", renamed, "2026-09-30")?.nameEn).toBe("Legal Unit");
    expect(unitInForce("LEGAL", renamed, "2026-10-01")?.nameEn).toBe("Legal Office");
    const cfg = { policy: { legalOfficeCode: "LEGAL" }, parts: [], recipients: [], units: renamed, bases: [] };
    expect(preparationSettings(cfg, null, "2026-10-02").office?.nameEn).toBe("Legal Office");
  });
  it("a unit starting tomorrow is not in force today, and is from tomorrow", () => {
    const later = [{ code: "NEW_LEGAL", nameEn: "New Legal Office", effectiveFrom: dayToDate("2026-10-03"), effectiveTo: null }];
    expect(legalOfficeKnown("NEW_LEGAL", later, "2026-10-02")).toBe(false);
    expect(preparationSettings({ policy: { legalOfficeCode: "NEW_LEGAL" }, parts: [], recipients: [], units: later, bases: [] }, null, "2026-10-02")).toMatchObject({ office: null, legalOfficeKnown: false });
    expect(legalOfficeKnown("NEW_LEGAL", later, "2026-10-03")).toBe(true);
  });
  it("the configuration reads the units with their start, and the policy act judges them in force", () => {
    const read = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");
    expect(read("src/lib/contract/load.ts")).toMatch(/orgUnit\.findMany\(\{ where: \{ organisationId \}, select: \{ code: true, nameEn: true, effectiveFrom: true, effectiveTo: true \}/);
    expect(read("src/app/configuration/contracts/actions.ts")).toContain("unitInForce(v.legalOfficeCode");
    expect(read("src/app/configuration/contracts/page.tsx")).not.toMatch(/effectiveTo == null/);
  });
});
