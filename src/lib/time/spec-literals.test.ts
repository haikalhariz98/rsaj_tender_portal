import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";
import { toPosix } from "@/lib/scan/files";

/**
 * BD-613-102 (T37 of run 1b's ruling trace): the spec's figures (2 weeks, 28 and 14 days, four weeks, 120 days, 5%, 24
 * hours, the RM1.00 rounding's examples, 30%, 0.025%) appear only in test fixtures and labels, never in a computation:
 * each is a setting or a parameter the caller passes.
 *
 * The scan reads run 1b's new rule files (src/lib/time, src/lib/matter/matter.ts and the run's src/lib/lad files) with
 * strings, comments and regular expressions blanked (`lex`), and fails on any number literal other than 0, 1 and 100
 * (a percentage's own scale) and the sen-per-ringgit 100n. What it does not read (its blind spots, declared): a figure
 * built by arithmetic (7 * 4), a figure in a file outside those listed, a figure read from JSON, and a `bigint` or
 * number passed in by an act from a literal of its own (the acts' scan, act-literals, is phase B's with the screens).
 */

const ROOT = process.cwd();
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [toPosix(path.join(dir, n))]));
const RUN1B_LAD = ["basis.ts", "credit.ts", "segments.ts", "waiver.ts", "accrual.ts", "scopes.ts", "frozen.ts"].map((f) => toPosix(path.join("src/lib/lad", f)));
const FILES = [...walk("src/lib/time"), "src/lib/matter/matter.ts", ...RUN1B_LAD].filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/labels\.ts$/.test(f)).filter((f) => {
  try {
    return statSync(path.join(ROOT, f)).isFile();
  } catch {
    return false;
  }
});

const ALLOWED = new Set(["0", "1", "100", "0n", "1n", "100n"]);
/// Number literals in code (strings, comments and regexes blanked), outside the allowed ones.
export function figuresIn(src: string): string[] {
  const code = lex(src);
  return [...code.matchAll(/(?<![\w.$])(\d[\d_]*(?:\.\d+)?n?)(?![\w.])/g)].map((m) => m[1]).filter((n) => !ALLOWED.has(n));
}

describe("BD-613-102: no spec figure computes in run 1b's rules", () => {
  it("the scan finds a figure in code and not in a string, a comment or a regex (self-test)", () => {
    expect(figuresIn("const due = dayPlus(on, 14);\nconst cap = 120;\n")).toEqual(["14", "120"]);
    expect(figuresIn('// 14 days\nconst t = "28 days";\nconst r = /\\d{4}-\\d{2}/;\nconst x = a[0] + 1;\n')).toEqual([]);
    expect(figuresIn("const r = 0.05;\nconst s = 5n;\n")).toEqual(["0.05", "5n"]);
  });

  it("over run 1b's rule files", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(7);
    const found = FILES.flatMap((f) => figuresIn(readFileSync(path.join(ROOT, f), "utf8")).map((n) => `${f}: ${n}`));
    expect(found).toEqual([]);
  });
});
