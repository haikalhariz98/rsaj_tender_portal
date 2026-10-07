import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A restricted exercise is hidden from everyone not named on it (FR-MTD-007, ADR 0034 D14, Phase 3a), and the hiding is not done screen by screen: it is
 * done where an exercise is reached. This scan keeps it so. Every non-test file under `src/` that reads exercises (a query on the exercise table, or
 * a call to one of the loaders that reads an exercise by its id) must also use one of the guards (`exerciseIsHidden`, `hiddenExercises`,
 * `hiddenExerciseIds`, `refuseHiddenExercise`, `exerciseNotHidden`, `approvalRouteNotHidden`, `matterIsHidden`, `hiddenDecisionIds`,
 * `exerciseAccessFacts`, or takes the `Reader`, the actor, that a guard needs), or be named in `READ_AFTER_A_GUARD` with the reason it is safe.
 * A file named there that no longer reads exercises, or now has a guard, fails too, so the list cannot go stale.
 *
 * What the scan cannot see (declared): that a file which mentions a guard calls it on every path; that a guard is given the right id; relation reads that
 * reach an exercise through another table (an award's, an approval route's) without the exercise's own table being queried. Those are covered by the
 * cross-organisation and restricted-exercise database suite (`sulit.db.test.ts`) and by review of the reads listed in the decisions log (Phase 3a).
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });

/// A read of exercises: the exercise table queried, or one of the loaders that reads an exercise (or its tab) by id.
const READS =
  /\bsourcingExercise\.(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy)\b|\b(loadExercise|withLockedRequisitionForSourcing|withLockedExerciseScope|withLockedExerciseForAward|scopeTab|bqTab|estimateTab|bidsTab|openingSection|scheduleSection|evaluationTabView|documentsTab|conditionsTab|appendixPage|printView|windowTab|briefingTab|addendaTab|nameListTab|saleRegister|invitationActs|attendanceRegisterCsv|listExercises|tableDocumentNote|windowColumns)\(/;

/// A guard: it keeps a restricted exercise from a reader not named on it, or takes the reader a guard needs.
const GUARDED = /\b(exerciseIsHidden|hiddenExercises|hiddenExerciseIds|refuseHiddenExercise|exerciseNotHidden|approvalRouteNotHidden|matterIsHidden|hiddenDecisionIds|exerciseAccessFacts|Reader)\b/;

/// Files that read exercises without a guard of their own, and why that is safe. Each is reached only from a guarded entry point.
export const READ_AFTER_A_GUARD: Readonly<Record<string, string>> = {
  "src/app/sourcing/[id]/bids/workspace.tsx": "rendered only by the exercise page (/sourcing/[id]), which refuses a hidden exercise before it renders a tab",
  "src/app/sourcing/[id]/documents/workspace.tsx": "rendered only by the exercise page, which refuses a hidden exercise first",
  "src/app/sourcing/[id]/evaluation/workspace.tsx": "rendered only by the exercise page, which refuses a hidden exercise first",
  "src/app/sourcing/[id]/scope/workspace.tsx": "rendered only by the exercise page, which refuses a hidden exercise first",
  "src/app/suppliers/[id]/standing-panels.tsx": "reads the exercises left after the supplier loader removed the hidden ones (`l.hidden`, from `loadSupplier`)",
  "src/lib/bids/read.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/bids/repo.ts": "the bids module's own loaders, called by the exercise page and by acts that run under `withLockedRequisitionForSourcing`",
  "src/lib/documents/hidden.ts": "the document guard itself: it finds the exercise a record of documents hangs on, to be asked about",
  "src/lib/documents/read.ts": "the owner and drawer readers, called through `src/app/documents/actions.ts`, which refuses an owner or a document under a hidden exercise first",
  "src/lib/evaluation/gate-read.ts": "the award gate's facts about an exercise already loaded under a guard",
  "src/lib/evaluation/read.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/method/overview-read.ts": "the overview tab's reads, called by the exercise page after its guard",
  "src/lib/opening/gate-read.ts": "the award gate's facts about an exercise already loaded under a guard",
  "src/lib/portal/repo.ts": "the public pages: a restricted exercise is never public (`isPublicOpportunity`), and nobody is signed in to be named",
  "src/lib/scope/read.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/suppliers/standing-repo.ts": "judges one supplier's standing for an exercise chosen from a list the guard already filtered, or inside an exercise lock",
  "src/lib/tender-docs/read-conditions.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/tender-docs/read.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/window/read.ts": "a tab's reader, called by the exercise page after its guard (`windowTab` takes the hidden list for the exercises it links)",
};

/// The source without its comments: block comments, and lines that are only a comment. The shared lexer is not used: it reads a `</span>` in a screen's markup
/// as the start of a regular expression and blanks the code after it, which would hide a read from this scan.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/// The files under `src/` that read exercises and name no guard.
export function unguarded(files: readonly { file: string; src: string }[]): string[] {
  return files.filter((f) => READS.test(withoutComments(f.src)) && !GUARDED.test(withoutComments(f.src))).map((f) => f.file);
}

describe("every read of exercises is guarded against a restricted one (FR-MTD-007)", () => {
  const files = walk(SRC).map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
  const bare = unguarded(files);

  it("no file reads exercises without a guard, unless it is named with its reason", () => {
    expect(bare.filter((f) => !(f in READ_AFTER_A_GUARD))).toEqual([]);
  });

  it("every file named still reads exercises and still has no guard of its own (the list cannot go stale)", () => {
    for (const f of Object.keys(READ_AFTER_A_GUARD)) expect(bare, f).toContain(f);
  });

  it("a reason is given for every file named", () => {
    for (const [f, why] of Object.entries(READ_AFTER_A_GUARD)) expect(why.length, f).toBeGreaterThan(20);
  });

  it("the scan finds an unguarded read, passes a guarded one, and ignores a mention in a comment (self-test)", () => {
    const read = "export const x = () => db.sourcingExercise.findMany({ where: {} });";
    expect(unguarded([{ file: "a.ts", src: read }])).toEqual(["a.ts"]);
    expect(unguarded([{ file: "b.ts", src: `${read}\nconst hidden = await hiddenExercises(actor);` }])).toEqual([]);
    expect(unguarded([{ file: "c.ts", src: "// db.sourcingExercise.findMany is not called here\nconst a = 1;" }])).toEqual([]);
    expect(unguarded([{ file: "d.ts", src: "const l = await loadExercise(org, id);" }])).toEqual(["d.ts"]);
  });

  it("the entry points that serve an exercise by its id are all guarded: every page, route and action file under sourcing/[id] that reads one names a guard", () => {
    const entries = files.filter((f) => f.file.startsWith("src/app/sourcing/[id]/") && /(page\.tsx|route\.ts|actions\.ts|shared\.ts)$/.test(f.file));
    expect(entries.length).toBeGreaterThan(10);
    expect(unguarded(entries)).toEqual([]);
  });
});

describe("a restricted exercise is never left with nobody who can see it (FR-MTD-007)", () => {
  const actions = readFileSync(path.join(SRC, "app/sourcing/actions.ts"), "utf8");
  const body = (fn: string) => {
    const at = actions.indexOf(`export async function ${fn}(`);
    expect(at, fn).toBeGreaterThan(-1);
    const next = actions.indexOf("\nexport ", at + 10);
    return actions.slice(at, next === -1 ? undefined : next);
  };
  it("making an exercise, and editing one, name the officer on it when the method restricts it", () => {
    expect(body("createExercise")).toMatch(/nameActorOnRestricted\(tx, actor,/);
    expect(body("updateExercise")).toMatch(/nameActorOnRestricted\(tx, actor,/);
  });
  it("removing a participant keeps at least one person named on a restricted exercise", () => {
    const fn = body("removeParticipant");
    expect(fn).toMatch(/namedAfterRemovingParticipant\(/);
    expect(fn.indexOf("namedAfterRemovingParticipant(")).toBeLessThan(fn.indexOf("exerciseParticipant.delete"));
  });
});

