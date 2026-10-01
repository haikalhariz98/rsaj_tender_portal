import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * X-2: the exercise's closing has two writers in the product — 6.4's approving step and,
 * from 6.5, the applied closing change — and the approved pack's frozen dates one. A scan
 * of the application source (`src/`), in the scope-writers.test.ts style: every write of
 * SourcingExercise (directly, or through `moveExercise`) that names `closingAt` or
 * `tenderingStartOn`, and every TenderPack write that names `approvedClosingAt`, is listed,
 * and only the approving step may appear. 6.5 adds its own writer here, by name.
 * Out of scope: the demo loader (`prisma/`), whose rows its own load checks against the lib.
 */

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "generated" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
const FILES = walk(join(ROOT, "src"));

/// Every call matching `re`, with its whole argument text, and the function it sits in.
function calls(src: string, re: RegExp): { text: string; within: string }[] {
  const out: { text: string; within: string }[] = [];
  for (const m of src.matchAll(re)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    const before = src.slice(0, m.index!);
    const fn = [...before.matchAll(/export async function (\w+)|async function (\w+)|function (\w+)/g)].pop();
    out.push({ text: src.slice(m.index!, i), within: fn ? (fn[1] ?? fn[2] ?? fn[3]) : "(module)" });
  }
  return out;
}

const EXERCISE_WRITE = /\.sourcingExercise\.(update|updateMany|upsert|create|createMany)\(|\bmoveExercise\(/g;
const PACK_WRITE = /\.tenderPack\.(update|updateMany|upsert|create|createMany)\(/g;

const writersOf = (re: RegExp, field: RegExp) =>
  FILES.flatMap((f) => {
    const src = readFileSync(f, "utf8");
    return calls(src, re)
      .filter((c) => field.test(c.text) && !/^\s*(export\s+)?async function moveExercise/.test(c.text))
      .map((c) => `${relative(ROOT, f).replace(/\\/g, "/")}#${c.within}`);
  }).filter((w) => !w.startsWith("src/lib/method/move.ts#"));

describe("X-2: who writes the closing", () => {
  it("only the approving step writes the exercise's closing and start", () => {
    expect([...new Set(writersOf(EXERCISE_WRITE, /\bclosingAt\b/))]).toEqual(["src/app/sourcing/[id]/documents/actions.ts#recordTenderingDecision"]);
    expect([...new Set(writersOf(EXERCISE_WRITE, /\btenderingStartOn\b/))]).toEqual(["src/app/sourcing/[id]/documents/actions.ts#recordTenderingDecision"]);
  });
  it("the same step, and only it, freezes the dates on the approved pack", () => {
    expect([...new Set(writersOf(PACK_WRITE, /\bapprovedClosingAt\b|\bapprovedStartOn\b/))]).toEqual(["src/app/sourcing/[id]/documents/actions.ts#recordTenderingDecision"]);
  });
  it("the approving step writes both in one act: the exercise's dates and the pack's frozen copy", () => {
    const src = readFileSync(join(ROOT, "src/app/sourcing/[id]/documents/actions.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function recordTenderingDecision"));
    expect(body).toMatch(/approvedStartOn: startDay, approvedClosingAt: closingAt/);
    expect(body).toMatch(/\{ tenderingStartOn: startDay, closingAt, approvedForTenderingAt: approvedAt \}/);
  });
});
