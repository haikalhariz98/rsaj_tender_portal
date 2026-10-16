import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A restricted exercise is hidden from everyone not named on it (FR-MTD-007, ADR 0034 D14, Phase 3a), and the hiding is not done screen by screen: it is
 * done where an exercise is reached. This scan keeps it so. Every non-test file under `src/` that reads exercises (a query on the exercise table, or
 * a call to one of the loaders that reads an exercise by its id) must also use one of the guards (`exerciseIsHidden`, `hiddenExercises`,
 * `hiddenExerciseIds`, `refuseHiddenExercise`, `exerciseNotHidden`, `approvalRouteNotHidden`, `matterIsHidden`, `hiddenDecisionIds`,
 * `exerciseAccessFacts`), or reach exercises only through a locking wrapper that itself refuses a hidden one (`GUARDED_WRAPPERS`, each held to its
 * guard below), or be named in `READ_AFTER_A_GUARD` with the reason it is safe. Merely taking or importing the `Reader` type is NOT a guard: it was
 * counted as one in the first build of this scan, and a file that mentioned it passed whatever it read.
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

/// The locking wrappers that refuse a hidden exercise themselves, in the transaction, and write the refusal to the log. A call to one is a guarded read.
const GUARDED_WRAPPERS = ["withLockedRequisitionForSourcing", "withLockedExerciseScope", "withLockedExerciseForAward"] as const;
const WRAPPER_CALL = new RegExp(`\\b(${GUARDED_WRAPPERS.join("|")})\\(`, "g");

/// A guard: it keeps a restricted exercise from a reader not named on it.
const GUARDED = /\b(exerciseIsHidden|hiddenExercises|hiddenExerciseIds|refuseHiddenExercise|exerciseNotHidden|approvalRouteNotHidden|matterIsHidden|hiddenDecisionIds|exerciseAccessFacts)\b/;

/// Files that read exercises without a guard of their own, and why that is safe. Each is reached only from a guarded entry point.
export const READ_AFTER_A_GUARD: Readonly<Record<string, string>> = {
  "src/app/sourcing/[id]/bids/workspace.tsx": "rendered only by the exercise page (/sourcing/[id]), which refuses a hidden exercise before it renders a tab",
  "src/app/sourcing/[id]/documents/workspace.tsx": "rendered only by the exercise page, which refuses a hidden exercise first",
  "src/app/sourcing/[id]/evaluation/workspace.tsx": "rendered only by the exercise page, which refuses a hidden exercise first",
  "src/app/sourcing/[id]/scope/officers-section.tsx": "SR-07: a section of Scope and estimate, rendered only by the exercise page, which refuses a hidden exercise first",
  // O1 (ruling 10): `src/lib/method/overview-read.ts` is no longer listed. The Overview is now the requisition summary and the flow; the tender conditions,
  // key dates and briefings it read moved to Scope and estimate (`prep-read.ts`, below), so it reads no exercise on its own and needs no entry.
  "src/lib/method/prep-read.ts": "SR-05: the reads of Scope and estimate's Details and Key dates sections, called by the exercise page after its guard",
  "src/app/sourcing/[id]/scope/workspace.tsx": "rendered only by the exercise page, which refuses a hidden exercise first",
  "src/app/suppliers/[id]/standing-panels.tsx": "reads the exercises left after the supplier loader removed the hidden ones (`l.hidden`, from `loadSupplier`)",
  "src/lib/bids/read.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/bids/repo.ts": "the bids module's own loaders, called by the exercise page and by acts that run under `withLockedRequisitionForSourcing`",
  "src/lib/documents/hidden.ts": "the document guard itself: it finds the exercise a record of documents hangs on, to be asked about",
  "src/app/sourcing/[id]/opening/workspace.tsx": "rendered only by the exercise page, which refuses a hidden exercise before it renders a tab",
  "src/lib/bids/online/audit-scope-store.ts": "selects only the id and submission channel of the exercise an audit row already names, to decide what the audit mask withholds; it shows nothing, and it returns only a yes or no per row for the mask",
  "src/lib/sealing/unlock-store.ts": "selects only the exercise id, to attach an access-event row to the exercise whose roster already names the officer; called only by `authoriseOnlineUnseal`, `checkUnlock` and the sealed-file download route, each of which asks `exerciseIsHidden` and answers as not found before any passphrase is derived or counted, and only a named opening officer passes it",
  "src/lib/documents/read.ts": "the owner and drawer readers, called through `src/app/documents/actions.ts`, which refuses an owner or a document under a hidden exercise first",
  "src/lib/evaluation/gate-read.ts": "the award gate's facts about an exercise already loaded under a guard",
  "src/lib/evaluation/read.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/opening/gate-read.ts": "the award gate's facts about an exercise already loaded under a guard",
  "src/lib/opening/read.ts": "a tab's reader (the opening, its schedule), called by the exercise page after its guard",
  "src/lib/portal/repo.ts": "the public pages: a restricted exercise is never public (`isPublicOpportunity`), and nobody is signed in to be named",
  "src/lib/scope/read.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/sealing/store.ts": "SR-13 step 8: the key ceremony's rows, read and written only inside an act that runs under `withLockedExerciseScope` (which refuses a hidden exercise) or by `windowData` for an exercise already loaded under a guard; it reads only whether the exercise's key fingerprint is frozen",
  // Changed for the ruling of 2026-10-08 on log line 1736: `src/lib/scope/estimate-access.ts` now asks `exerciseAccessFacts` itself (who the evaluation is open to), so it has a guard of its own and is
  // no longer named here. The Secretariat and Internal Audit reader (ruling on line 1735) reads each exercise's unit to tell which department's holder reads it.
  "src/lib/auth/evaluation-readers-store.ts": "reads only the unit of exercises whose ids the caller already judged (`sulitGates`, `estimateAccessFor` and the document gates ask `exerciseAccessFacts` for the same ids), to tell which department's holder of an office reads them, and returns no exercise",
  // Decisions log, 2026-10-09, ruling on 1867(3): reads only the exercises where the person sits on the evaluation team, to find the bidder names and prices to take OUT of the rows they are shown. It returns those
  // strings and shows nothing of an exercise, so it can reveal nothing a hidden exercise would hide.
  "src/lib/evaluation/blind-audit-store.ts": "reads only exercises the person sits on the evaluation team of, and returns the names and figures to withhold from them, never an exercise's content",
  "src/lib/suppliers/standing-repo.ts": "judges one supplier's standing for an exercise chosen from a list the guard already filtered, or inside an exercise lock",
  "src/lib/tender-docs/read-conditions.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/tender-docs/read.ts": "a tab's reader, called by the exercise page after its guard",
  "src/lib/window/read.ts": "a tab's reader, called by the exercise page after its guard (`windowTab` takes the hidden list for the exercises it links)",
  // Phase 4d, My Bids: a SUPPLIER reads exercises, and a supplier is never named on one (the guards above ask about a staff reader). What it may see is decided by `supplierSees`, in `loadBidContext`: a public
  // opportunity (`isPublicOpportunity` drops every restricted one) or an exercise the office linked a party of this supplier to, with its window published. Every other id reads as not found.
  "src/lib/portal/bids/context-store.ts": "the one gate of My Bids: reads an exercise only as `supplierSees` allows (public, or linked to this supplier by the office), and answers null for a restricted one the supplier is not linked to",
  "src/lib/portal/bids/inspection-store.ts": "opens the tender documents only after `loadBidContext` has admitted the exercise for this supplier",
  "src/lib/portal/bids/list-store.ts": "lists only exercises `supplierSees` admits for this supplier, each judged by the same rule as the page of one exercise",
  "src/lib/portal/bids/workspace-store.ts": "a tab's reader, called by the My Bids page of one exercise after `loadBidContext` has admitted it for this supplier",
  "src/lib/bids/online/upload-store.ts": "SR-13 step 9: a SUPPLIER uploads a bid part. `loadUploadFacts` reads the exercise only after `loadBidContext` (the one gate of My Bids, `supplierSees`) has admitted it for this supplier and answers null otherwise; `logPartRefusal` reads only an exercise id of the actor's own organisation, to know whether a row may be written, and returns nothing of it",
  "src/lib/sealing/key-history.ts": "SR-13 step 11: a SUPPLIER reads the history of an online exercise's published key, only after `loadBidContext` (the one gate of My Bids, `supplierSees`) has admitted the exercise for this supplier; it selects the exercise's channel and published fingerprint and the key changes' times and fingerprints, and answers null otherwise",
  "src/app/supplier/bids/[id]/panels.tsx": "renders the tabs of the My Bids page of one exercise, which is admitted by `loadBidContext` before any tab renders",
};

/// The source without its comments: block comments, and lines that are only a comment. The shared lexer is not used: it reads a `</span>` in a screen's markup
/// as the start of a regular expression and blanks the code after it, which would hide a read from this scan.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/// The files under `src/` that read exercises and name no guard.
export function unguarded(files: readonly { file: string; src: string }[]): string[] {
  return files
    .filter((f) => {
      const code = withoutComments(f.src);
      // A call to a guarded wrapper is not a bare read; any other read in the file still is.
      return READS.test(code.replace(WRAPPER_CALL, "guarded(")) && !GUARDED.test(code);
    })
    .map((f) => f.file);
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

  it("each guarded wrapper refuses a hidden exercise itself, or hands the reader to one that does", () => {
    const body = (file: string, fn: string) => {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      const at = src.indexOf(`export async function ${fn}`);
      expect(at, fn).toBeGreaterThan(-1);
      const next = src.indexOf("\nexport ", at + 10);
      return src.slice(at, next === -1 ? undefined : next);
    };
    expect(body("src/lib/method/repo.ts", "withLockedRequisitionForSourcing")).toMatch(/refuseHiddenExercise\(tx, reader,/);
    expect(body("src/lib/award/repo.ts", "withLockedExerciseForAward")).toMatch(/refuseHiddenExercise\(tx, reader,/);
    expect(body("src/lib/scope/lock.ts", "withLockedExerciseScope")).toMatch(/withLockedRequisitionForSourcing\(reader,/);
  });

  it("a bare mention of the Reader type is not a guard, and a call to a guarded wrapper is (self-test)", () => {
    const read = "export const x = (reader: Reader) => db.sourcingExercise.findMany({ where: {} });";
    expect(unguarded([{ file: "a.ts", src: `import type { Reader } from "@/lib/auth/sulit-store";\n${read}` }])).toEqual(["a.ts"]);
    expect(unguarded([{ file: "b.ts", src: "await withLockedRequisitionForSourcing(actor, r, e, fn);" }])).toEqual([]);
    expect(unguarded([{ file: "c.ts", src: "await withLockedRequisitionForSourcing(actor, r, e, fn);\nawait loadExercise(org, id);" }])).toEqual(["c.ts"]);
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

describe("tabling a matter by the reference typed finds an exercise only as the reader may see it (FR-MTD-007)", () => {
  const actions = readFileSync(path.join(SRC, "app/committees/actions.ts"), "utf8");
  it("the committee actions look an exercise up by its reference only through the guarded lookup, and check a dependency the same way", () => {
    expect(withoutComments(actions)).not.toMatch(/sourcingExercise\.findMany\(\{ where: \{ organisationId: s\.organisationId, reference/);
    expect(actions).toMatch(/exerciseByTabledReference\(tx, reader,/);
    expect(actions).toMatch(/dependencyIsHidden\(tx, reader,/);
  });
});

describe("a reader who may not read the estimate is not told it by what is made of it (FR-MTD-007, Phase 3a review)", () => {
  const read = (f: string) => readFileSync(path.join(SRC, f), "utf8");
  const sourcing = read("app/sourcing/actions.ts");
  const page = read("app/sourcing/[id]/page.tsx");
  const overview = read("app/sourcing/[id]/overview.tsx");
  it("a refused save words its findings with findingTextFor, and both saves give it the other exercises of the requisition", () => {
    const at = sourcing.indexOf("async function faultState(");
    const faultState = sourcing.slice(at, sourcing.indexOf("\n}\n", at));
    expect(faultState).toContain("siblingAmountsWithheld(actor, siblings)");
    expect(faultState).not.toMatch(/\bfindingText\(/);
    expect(faultState.match(/findingTextFor\(f, withheld\)/g)).toHaveLength(2);
    expect(sourcing).toMatch(/faultState\(actor, r, blockers, l\.req\.exercises\)/);
    expect(sourcing).toMatch(/faultState\(actor, r, blockers, l\.req\.exercises\.filter\(\(x\) => x\.id !== ex\.id\)\)/);
  });
  it("the scope lines, which add up to the estimate, are judged as the estimate is: on the Overview and in the History", () => {
    expect(overview).toMatch(/p\.estimate\.state === "WITHHELD" \? <SulitValue of=\{p\.estimate as Sulit<ReactNode>\} \/> : money\(s\.amount\)/);
    expect(page).toMatch(/field === "amount" && entity === "ExerciseScopePart"/);
  });
  it("the boundary is not said, on the exercise's page, to a reader who may not read the estimate: the callout, the line, the summary, the finding and the History row", () => {
    expect(overview).toMatch(/bands\?\.boundary\.onBoundary && p\.estimate\.state !== "WITHHELD"/);
    expect(overview).toMatch(/bands\.boundary\.onBoundary && p\.estimate\.state !== "WITHHELD"/);
    expect(page).toMatch(/ev\?\.bands\.boundary\.onBoundary && estimate\.state !== "WITHHELD"/);
    expect(page).toMatch(/findingsShownTo\(/);
    expect(page).toMatch(/field === "onBoundary" && estimate\.state === "WITHHELD"/);
  });
  it("the disclosed company estimate in the History goes through the estimate's custody", () => {
    expect(page).toMatch(/CUSTODY_FIELDS\.has\(field\)/);
    expect(page).toMatch(/estimateCustodyForHistory\(actor, ex\.id\)/);
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


describe("naming a person on an exercise is an authorised act (FR-MTD-007, Phase 3a review)", () => {
  // Being named is what opens an exercise's classified figures, so every write that names someone asks `namingRefusal` first, in the same transaction.
  const read = (f: string) => readFileSync(path.join(SRC, f), "utf8");
  const fnBody = (src: string, fn: string) => {
    const at = src.indexOf(`export async function ${fn}(`);
    expect(at, fn).toBeGreaterThan(-1);
    const next = src.indexOf("\nexport ", at + 10);
    return src.slice(at, next === -1 ? undefined : next);
  };
  const before = (body: string, guard: string, write: string) => {
    expect(body, guard).toContain(guard);
    expect(body, write).toContain(write);
    expect(body.indexOf(guard), `${guard} before ${write}`).toBeLessThan(body.indexOf(write));
  };
  const sourcing = read("app/sourcing/actions.ts");
  const evaluation = read("app/sourcing/[id]/evaluation/actions.ts");

  it("adding a participant, changing the person in charge, reviewing a proposal, restricting an exercise by editing it, and appointing a team each ask before they write", () => {
    before(fnBody(sourcing, "addParticipant"), "namingRefusal(tx, actor, ex.id, [person.id])", "exerciseParticipant.create");
    before(fnBody(sourcing, "saveExerciseDetails"), "namingRefusal(tx, actor, ex.id, [person.id])", "sourcingExercise.update(");
    before(fnBody(sourcing, "saveExerciseDetails"), "namedAfterChangingPersonInCharge(", "sourcingExercise.update(");
    before(fnBody(sourcing, "reviewProposal"), "namingRefusal(tx, actor, ex.id, [person!.id], { selfAllowed: true })", "sourcingExercise.update(");
    before(fnBody(sourcing, "updateExercise"), "namingRefusal(tx, actor, ex.id, [], { selfAllowed: true })", "sourcingExercise.updateMany(");
    before(fnBody(evaluation, "startEvaluation"), "namingRefusal(tx, actor, l.ex.id,", "evaluationTeamMember.create");
    before(fnBody(evaluation, "appointTeamMember"), "namingRefusal(tx, actor, l.ex.id, [personId])", "evaluationTeamMember.create");
  });

  it("whoever opens an exercise is named on it, restricted or not, so that they can read and correct their own draft", () => {
    expect(fnBody(sourcing, "createExercise")).toMatch(/nameActorOnRestricted\(tx, actor, l\.org\.id, \{[^}]*\}, "MADE"\)/);
  });

  // The files that write a named slot: each asks `namingRefusal`, or says why the slot is not the actor's to choose.
  const SLOT_WRITES = /\b(exerciseParticipant\.(create|createMany|upsert)|evaluationTeamMember\.(create|createMany|upsert)|openingPanelMember\.(create|createMany|upsert))\(|\b(personInChargeId|proposalReviewerPersonId)\s*:/;
  const SLOT_WRITERS_WITHOUT_ASKING: Readonly<Record<string, string>> = {
    "src/app/sourcing/[id]/opening/actions.ts": "the opening panel is the seats of the committee's roster present at the opening (`c.seats`), designated by the committee's configuration and not chosen by the officer who starts it",
    "src/lib/auth/sulit-access.ts": "the rule's own type for the named slots: no write",
    "src/app/sourcing/editors.tsx": "a drawer's prop and its form value: the write is `saveExerciseDetails`, which asks",
    "src/lib/evaluation/versions.ts": "a new evaluation version carries the previous version's team forward, the same people: no one is newly named",
    "src/lib/method/proposal.ts": "clears the reviewer when a change re-opens the proposal: it names no one",
  };
  it("every write of a named slot is guarded, or named here with the reason it is not the actor's choice (the list cannot go stale)", () => {
    const files = walk(SRC).map((f) => ({ file: rel(f), src: withoutComments(readFileSync(f, "utf8")) }));
    const writers = files.filter((f) => SLOT_WRITES.test(f.src));
    const unasked = writers.filter((f) => !/namingRefusal\(/.test(f.src)).map((f) => f.file);
    expect(unasked.filter((f) => !(f in SLOT_WRITERS_WITHOUT_ASKING))).toEqual([]);
    for (const f of Object.keys(SLOT_WRITERS_WITHOUT_ASKING)) expect(unasked, f).toContain(f);
  });
});
