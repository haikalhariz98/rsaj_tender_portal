import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { auditCsv, SULIT_WITHHELD } from "@/lib/audit/export";
import { isSulitField } from "@/lib/sulit-fields";

/**
 * Ruling Q2 (BD-612-24): the arithmetic variance is SULIT. With the contract sum it gives the selected
 * tender's total after arithmetic correction (6.8's correctedPrice). Registered under a specific key, written
 * to the completion trail under it, withheld from the export, chipped in History and on both screens (still
 * shown, per OD-3 A).
 */

const read = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");

describe("the arithmetic variance is SULIT", () => {
  it("registered as arithmeticVarianceAmount, not the function's name", () => {
    expect(isSulitField("arithmeticVarianceAmount")).toBe(true);
    expect(isSulitField("arithmeticVariance")).toBe(false);
  });
  it("the completion act writes it under that key, never as bare variance", () => {
    const src = read("src/app/projects/[id]/actions.ts");
    const body = src.slice(src.indexOf("export async function completeCheck("), src.indexOf("export async function submitLegal("));
    expect(body).toMatch(/arithmeticVarianceAmount: variance == null \? null : senToDecimalString\(variance\)/);
    expect(body).not.toMatch(/[{,]\s*variance:/);
  });
  it("withheld from the audit export", () => {
    const csv = auditCsv([{ id: "a1", at: new Date("2026-10-03T02:00:00Z"), entity: "FormationCheck", entityId: "k1", entityLabel: "Contract X · check arithmetic", action: "UPDATE", changes: [{ field: "arithmeticVarianceAmount", before: null, after: "-34.50" }, { field: "lines", before: null, after: "2" }], reason: "", unattributed: true, actorName: null }], "Asia/Kuala_Lumpur");
    expect(csv).toContain(SULIT_WITHHELD);
    expect(csv).not.toContain("-34.50");
  });
  it("chipped in History and on the Overview and Formation tab", () => {
    expect(read("src/app/projects/[id]/page.tsx")).toMatch(/isSulitField\(field\) && value \? <SulitValue>/);
    expect(read("src/app/projects/[id]/page.tsx")).toMatch(/<SulitValue>\{`\$\{variance < 0n \? "−" : "\+"\}/);
    expect(read("src/app/projects/[id]/formation-panels.tsx")).toMatch(/Variance against the tendered figures: <SulitValue>/);
  });
});
