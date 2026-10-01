import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { formLabel, resolveComposition } from "./composition";
import { OMP005_QUOTATION_PARTS, SK001_TEMPLATE_NAMES, SK001_TENDER_PARTS } from "./sk001-fixture";
import type { ConfiguredPart, ResolvedPart } from "./types";

/**
 * Plan 6.4 tests 1 and 2 (FR-DOC-001, 002, 013; FR-MTD-013), on RSAJ's part lists as a
 * test-only fixture (Q-8): the product ships no parts, and an empty configuration says so.
 */

const ON = "2026-10-01";
const ALL = [...SK001_TENDER_PARTS, ...OMP005_QUOTATION_PARTS];
const partsOf = (c: ReturnType<typeof resolveComposition>): ResolvedPart[] => {
  if ("fault" in c) throw new Error(`no composition: ${c.fault}`);
  return c.parts;
};
const numbers = (ps: ResolvedPart[]) => ps.map((p) => p.printedNumber);
const name = (code: string) => SK001_TEMPLATE_NAMES[code] ?? null;

describe("test 1: the composition follows pack kind and basis", () => {
  it("TENDER × bills of quantities: twelve parts in printed order, 7a and no 7b", () => {
    const ps = partsOf(resolveComposition(ALL, "TENDER", "bq", ON));
    expect(ps).toHaveLength(12);
    expect(numbers(ps)).toEqual(["1", "2", "3", "3a", "4", "5", "6", "7a", "8", "9", "10", "11"]);
    expect(ps.find((p) => p.printedNumber === "7a")?.labelEn).toBe("Bills of Quantities");
    expect(ps.some((p) => p.role === "SUMMARY_AND_RATES")).toBe(false);
  });

  it("TENDER × drawings and specification: 7b and no bill (the printed list's defect corrected, 7.3.4)", () => {
    const ps = partsOf(resolveComposition(ALL, "TENDER", "ds", ON));
    expect(ps).toHaveLength(12);
    expect(numbers(ps)).toEqual(["1", "2", "3", "3a", "4", "5", "6", "7b", "8", "9", "10", "11"]);
    expect(ps.some((p) => p.role === "BILL_OF_QUANTITIES")).toBe(false);
    expect(ps.find((p) => p.printedNumber === "7b")?.labelEn).toBe("Summary of Tender and Schedule of Rates");
  });

  it("QUOTATION × bills of quantities: OM/P/005 §3.2's nine parts, not the tender pack", () => {
    const ps = partsOf(resolveComposition(ALL, "QUOTATION", "bq", ON));
    expect(ps.map((p) => p.labelEn)).toEqual([
      "Kenyataan Sebutharga",
      "Corrigendum",
      "Arahan kepada Penender",
      "Syarat-syarat Sebutharga Untuk Kerja",
      "Penentu Kerja",
      "Borang Sebutharga",
      "Bill of Quantities",
      "Latar Belakang Penender",
      "Lukisan",
    ]);
  });

  it("an empty configuration is not set, never a default list", () => {
    expect(resolveComposition([], "TENDER", "bq", ON)).toEqual({ fault: "COMPOSITION_NOT_SET" });
    expect(resolveComposition(SK001_TENDER_PARTS, "QUOTATION", "bq", ON)).toEqual({ fault: "COMPOSITION_NOT_SET" });
  });

  it("no basis, or a method with no pack, has no composition", () => {
    expect(resolveComposition(ALL, "TENDER", null, ON)).toEqual({ fault: "BASIS_NOT_SET" });
    expect(resolveComposition(ALL, "NONE", "bq", ON)).toEqual({ fault: "NO_PACK" });
  });

  it("a part configured for the basis replaces the any-basis part of its role", () => {
    const anyConditions: ConfiguredPart = { ...SK001_TENDER_PARTS[2], code: "t03any", contractBasisCode: null, templateCode: "generic" };
    const ps = partsOf(resolveComposition([...SK001_TENDER_PARTS, anyConditions], "TENDER", "bq", ON));
    expect(ps.filter((p) => p.role === "CONDITIONS").map((p) => p.code)).toEqual(["t03bq"]);
    // On a basis with no part of its own, the any-basis one stands.
    const other = partsOf(resolveComposition([...SK001_TENDER_PARTS, anyConditions], "TENDER", "turnkey", ON));
    expect(other.filter((p) => p.role === "CONDITIONS").map((p) => p.code)).toEqual(["t03any"]);
  });

  it("two parts of one role at one reach are refused; OTHER may repeat", () => {
    const twice = [...SK001_TENDER_PARTS, { ...SK001_TENDER_PARTS[1], code: "t02x" }];
    expect(resolveComposition(twice, "TENDER", "bq", ON)).toEqual({ fault: "DUPLICATE_ROLE", role: "FORM_OF_TENDER" });
    const others = [...OMP005_QUOTATION_PARTS, { ...OMP005_QUOTATION_PARTS[1], code: "q2x", printedNumber: "2a" }];
    expect(partsOf(resolveComposition(others, "QUOTATION", "bq", ON)).filter((p) => p.role === "OTHER")).toHaveLength(2);
  });

  it("a pack with no conditions part has no form, and is refused", () => {
    expect(resolveComposition(SK001_TENDER_PARTS.filter((p) => p.role !== "CONDITIONS"), "TENDER", "bq", ON)).toEqual({ fault: "NO_CONDITIONS_PART" });
  });

  it("a part retired on or before the day is not used", () => {
    const retired = SK001_TENDER_PARTS.map((p) => (p.code === "t10" ? { ...p, retiredOn: ON } : p));
    expect(numbers(partsOf(resolveComposition(retired, "TENDER", "bq", ON)))).not.toContain("10");
    const later = SK001_TENDER_PARTS.map((p) => (p.code === "t10" ? { ...p, retiredOn: "2026-10-02" } : p));
    expect(numbers(partsOf(resolveComposition(later, "TENDER", "bq", ON)))).toContain("10");
  });
});

describe("test 2: the form follows the basis (FR-DOC-002, FR-MTD-013)", () => {
  it("changing the basis from bills to drawings and specification changes the form, with no other input", () => {
    const bq = formLabel(partsOf(resolveComposition(ALL, "TENDER", "bq", ON)), name);
    const ds = formLabel(partsOf(resolveComposition(ALL, "TENDER", "ds", ON)), name);
    expect(bq).toMatch(/^JKR 203A/);
    expect(ds).toMatch(/^JKR 203:/);
    expect(bq).not.toBe(ds);
  });
  it("a conditions part naming no template, or one not configured, has no form", () => {
    expect(formLabel([{ role: "CONDITIONS", templateCode: null }], name)).toBeNull();
    expect(formLabel([{ role: "CONDITIONS", templateCode: "gone" }], name)).toBeNull();
  });
});

describe("the RSAJ part lists stay a test fixture (Q-8)", () => {
  it("no source outside a test imports the fixture, and nothing seeds it", () => {
    const root = process.cwd();
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) return f === "generated" ? [] : walk(p);
        return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
      });
    const files = [...walk(join(root, "src")), ...walk(join(root, "prisma"))];
    const offenders = files.filter((f) => /sk001-fixture/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
