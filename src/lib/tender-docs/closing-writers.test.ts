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
 * Out of scope for the call scan: the demo loader (`prisma/`), whose rows its own load
 * checks against the lib.
 *
 * The call scan sees only Prisma calls. A second scan (review carry a) catches the closing
 * written any other way: a quoted "closingAt" (a raw SQL column, or a key built as a
 * string) anywhere in `src/` or the demo loader outside the writers, and a `closingAt:`
 * key in any file not listed below with what it does with the closing. A new file naming
 * the key fails here until it is listed, by name, with its reason.
 */

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "generated" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
const FILES = walk(join(ROOT, "src"));
/// The demo loader's own files (never its migrations: the column's DDL is not a write).
const PRISMA_FILES = readdirSync(join(ROOT, "prisma")).filter((f) => /\.ts$/.test(f)).map((f) => join(ROOT, "prisma", f));
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");

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
    // 6.5 (X-2, faithful update, flagged): the applied closing change is the closing's second writer, by name.
    expect([...new Set(writersOf(EXERCISE_WRITE, /\bclosingAt\b/))].sort()).toEqual(["src/app/sourcing/[id]/documents/actions.ts#recordTenderingDecision", "src/app/sourcing/[id]/window/change-actions.ts#applyClosingChange"]);
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

/// The writers of the closing: 6.4's approving step and 6.5's applied closing change, by name.
const CLOSING_WRITERS = ["src/app/sourcing/[id]/documents/actions.ts", "src/app/sourcing/[id]/window/change-actions.ts"];

/// Every other file that names the `closingAt:` key, and what it does with it. None writes it.
const CLOSING_KEY_READERS: Record<string, string> = {
  "src/lib/tender-docs/tendering.ts": "works out the closing instant from the approver's day and time, and returns it; writes nothing",
  "src/lib/scope/estimate.ts": "judges an estimate against the closing it is given",
  "src/lib/scope/read.ts": "selects the closing for the estimate tab",
  "prisma/demo-tender-docs.ts": "the demo's approving step, mirroring the action; its load checks the dates against the pack",
  "prisma/demo-scope.ts": "judges the demo's estimates with no closing yet",
  // 6.5 (faithful update, flagged): the demo's applied extension, as 6.4's demo mirrors its approving step.
  "prisma/demo-window.ts": "the demo's applied extension, mirroring applyClosingChange; its load checks the closing against the change's history",
  // 6.5 (faithful update, flagged): the window's pure rules read the closing they are given.
  "src/lib/window/dates.ts": "judges a closing against the date rules; writes nothing",
  "src/lib/window/change.ts": "judges a proposed closing against the date rules; writes nothing",
  "src/lib/window/phase.ts": "derives the phase and the closing's history from the stored dates; writes nothing",
  "src/lib/window/publish.ts": "passes the closing to the date rules at publication; writes nothing",
  "src/lib/window/events.ts": "judges an event against the closing it is given; writes nothing",
  "src/lib/window/fields.ts": "states the closing in an instrument's words; writes nothing",
  "src/lib/window/repo.ts": "reads the exercise's closing for the window's rules; writes nothing",
  "src/lib/window/judge.ts": "passes the closing to the phase and the instruments; writes nothing",
  "src/lib/window/read.ts": "shows the closing's history from the stored dates; writes nothing",
  "src/lib/window/gate.ts": "derives the award gate's phase from the closing; writes nothing",
  // 6.6 (listed, flagged): the envelope register reads the closing it judges lateness and validity against.
  "src/lib/bids/repo.ts": "selects the exercise's closing for the register's rules and the award's validity check; writes nothing",
  "src/lib/bids/read.ts": "selects the exercise's closing for the Bids received tab; writes nothing",
  "prisma/demo-bids.ts": "reads the closings the demo's receipts, box and extension are judged against; writes nothing",
  // 6.15a (listed, flagged): the register's window check reads the closing's day (FR-VND-009).
  "src/lib/suppliers/standing-repo.ts": "selects the exercise's closing for the register's window check; writes nothing",
  // The public portal (founder, 2026-10-06): the opportunities page reads the closing to say when an advertised exercise closes.
  "src/lib/portal/select.ts": "selects the exercise's closing for the public opportunity pages; writes nothing",
  "src/lib/portal/public.ts": "states the closing in the organisation's time and judges open or closed from it; writes nothing",
  "src/lib/portal/results.ts": "passes the closing to the public rule that decides whether an awarded exercise is listed; writes nothing",
};

describe("X-2: the closing is written nowhere else, by any route (carry a)", () => {
  // Comments are prose (they name the column in backticks); code and SQL strings are what write.
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const files = [...FILES, ...PRISMA_FILES].map((f) => ({ path: rel(f), src: code(readFileSync(f, "utf8")) }));
  it("a quoted closingAt (raw SQL's column, or a key built as a string) appears only in a writer", () => {
    const quoted = files.filter((f) => /["'`]closingAt["'`]/.test(f.src)).map((f) => f.path);
    expect(quoted.filter((p) => !CLOSING_WRITERS.includes(p))).toEqual([]);
  });
  it("the closingAt: key appears only in a writer or a file listed with what it does", () => {
    const keyed = files.filter((f) => /\bclosingAt\s*:/.test(f.src)).map((f) => f.path);
    expect(keyed.filter((p) => !CLOSING_WRITERS.includes(p) && !(p in CLOSING_KEY_READERS))).toEqual([]);
  });
  it("the scan catches what it is for", () => {
    expect(/["'`]closingAt["'`]/.test('UPDATE "SourcingExercise" SET "closingAt" = now()')).toBe(true);
    expect(/\bclosingAt\s*:/.test("data: { closingAt: new Date() }")).toBe(true);
    expect(/\bclosingAt\s*:/.test("proposedClosingAt: x")).toBe(false);
  });
});
