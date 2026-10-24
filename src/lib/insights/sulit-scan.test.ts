import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { toPosix } from "@/lib/scan/files";
import { sulitFieldsIn } from "@/lib/sulit-fields";

/**
 * v1 of the Dashboard reads no SULIT field (product owner, DB-2, 2026-10-24). No file of its domain code, nor its chart component, names
 * any field of the SULIT registry: not the estimate, not a price, not a figure of the evaluation. The registry matches whole words
 * (`sulitFieldsIn`), so a field added to it later is caught here the day it is added.
 */

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(n) ? [toPosix(p)] : [];
  });
const files = [...walk(path.join(ROOT, "src/lib/insights")), toPosix(path.join(ROOT, "src/components/ui/chart.tsx"))];

describe("the Dashboard reads no SULIT field (DB-2)", () => {
  it("the scan finds a planted field, so it cannot pass empty", () => {
    // Built by concatenation so this file itself names no field.
    expect(sulitFieldsIn(`const x = r.${"estimated" + "Value"};`).length).toBe(1);
  });
  it("scans its own files", () => {
    expect(files.some((f) => f.endsWith("/where.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("/chart.tsx"))).toBe(true);
  });
  it("no file under src/lib/insights, nor the chart component, names a registered field", () => {
    const bad = files.flatMap((f) => sulitFieldsIn(readFileSync(f, "utf8")).map((s) => `${path.relative(ROOT, f)} names ${s.field} (${s.what})`));
    expect(bad).toEqual([]);
  });
});
