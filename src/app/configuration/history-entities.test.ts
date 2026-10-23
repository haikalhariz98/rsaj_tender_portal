import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { toPosix } from "@/lib/scan/files";
import { fieldLabel } from "@/lib/audit/diff";

/**
 * BD-614-34 as ruled: every entity a History button asks for is on Configuration history's allow-list, so a button
 * never reads empty for want of its name (it did for 6.14 increment 1's configuration and for others, found late).
 */
const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(join(ROOT, p)).isDirectory()) return n === "generated" ? [] : walk(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [toPosix(p)] : [];
  });

describe("History buttons ask only for allow-listed entities", () => {
  const src = readFileSync(join(ROOT, "src/app/configuration/history.ts"), "utf8");
  const set = src.slice(src.indexOf("const ENTITIES = new Set(["), src.indexOf("]);", src.indexOf("const ENTITIES = new Set([")));
  const listed = new Set([...set.matchAll(/"(\w+)"/g)].map((m) => m[1]));
  const asked = walk("src").flatMap((f) => [...readFileSync(join(ROOT, f), "utf8").matchAll(/<HistoryButton\b[^>]*?\bentity=(?:"(\w+)"|\{([^}]*)\})/g)].map((m) => ({ f, entity: m[1], expr: m[2] })));
  it("finds the buttons", () => expect(asked.length).toBeGreaterThan(40));
  it("every entity a button names by a literal is on the list", () => {
    expect(asked.filter((a) => a.entity && !listed.has(a.entity)).map((a) => `${a.f}: ${a.entity}`)).toEqual([]);
  });
  it("no button names its entity by an expression the scan cannot read", () => {
    expect(asked.filter((a) => a.expr != null).map((a) => `${a.f}: {${a.expr}}`)).toEqual([]);
  });
});

describe("old audit rows of dropped settings still read (simplification plan 5.8)", () => {
  it("names the requisition splitting settings in words, not as column names", () => {
    expect(fieldLabel("splittingWindowDays")).toBe("Splitting window (days)");
    expect(fieldLabel("splittingMatchOn")).toBe("Splitting: fields compared");
    expect(fieldLabel("splittingAggregateAcrossYear")).toBe("Splitting: whole financial year counted");
    expect(fieldLabel("splitJustifyingRoleCode")).toBe("Office that may justify a possible split");
  });
});
