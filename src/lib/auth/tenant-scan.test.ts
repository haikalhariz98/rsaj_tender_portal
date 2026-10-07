import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { closing, lex } from "@/lib/scan/source";

/**
 * Organisation isolation (ADR 0034 D10, sign-in programme Phase 1c): the actor's organisation scopes every query.
 *
 * `ORGANISATION_CODE` names the deployment's one organisation. Before sign-in it was how every screen and act found "the"
 * organisation; now the signed-in actor's (`actor.organisationId`, `actor.organisationCode`) is. The constant is read only
 * where nobody is signed in to name one: the public pages and the pre-sign-in screens through `src/lib/portal/deployment.ts`,
 * the seeds in `prisma/` and the scripts. Anywhere else under `src/` it is a failure here: a second customer's actor would
 * otherwise read the first customer's rows.
 *
 * Every load or write by id in an action, a route handler or their shared helpers (every non-test `.ts` under `src/app`) names
 * the organisation in its `where`: `organisationId: actor.organisationId` on a table that carries it (Prisma's extended unique
 * `where`), or, on a child table that does not, its parent's (`instance: { organisationId }`, `meeting: { committee: { organisationId } }`).
 * A row of another organisation then reads as "no longer exists" rather than being read or written. The rule, as this scan
 * applies it, to `findUnique`, `findFirst`, `update`, `delete`, `upsert` and their `OrThrow` forms:
 *
 * - a `where` keyed by `id` at its top level must mention `organisationId` somewhere inside it;
 * - the organisation's own row (`organisation.*`) is keyed by the id already resolved for the actor (`orgId`, `org.id`,
 *   `…organisationId`), which is its organisation filter;
 * - a `where` that is not written out (a variable) cannot be read and fails, as an unfiltered one does;
 * - an exception is marked `// tenant: via <parent>` on the line above the call and named, with its parent, in `VIA_PARENT` below; a
 *   stale entry fails too.
 *
 * Blind spots (declared): pages and components (`.tsx`), which read through `src/lib` loaders that take the organisation; the
 * `src/lib` modules the actions call, whose root loaders and locks take the organisation (Phase 1c part 1) and whose reach is checked
 * by the cross-organisation suite (`src/lib/auth/tenant.db.test.ts`), not by this scan; a query keyed by a foreign key rather
 * than `id` (`exerciseId`, `meetingId`), which follows a parent already loaded for the organisation; raw SQL. The scan does not judge
 * that the value named is the actor's: the codemod that wrote these names `actor.organisationId` (or `scope.organisationId`, or a
 * locked record's `l.org.id`, itself loaded for the actor), and the database suite is what proves the refusal.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

/// Where the constant may be read, and why. A file listed that no longer reads it fails too, so the list cannot go stale.
const MAY_READ: Readonly<Record<string, string>> = {
  "src/lib/org.ts": "it is defined here, from the environment",
  "src/lib/portal/deployment.ts": "the deployment's one organisation, for what runs before anyone signs in: the public pages, the sign-in screens and the frame around them, and a loader's acts",
  "src/lib/test-db/setup.ts": "sets the variable to the database tests' own organisation before anything reads it; it reads nothing itself",
};
/// The portal's own modules serve anonymous public pages (ADR 0034 D10 names `src/lib/portal/**`); none reads the constant today except through deployment.ts.
const PORTAL = "src/lib/portal/";

/// The files under src/ whose code (not their comments or strings) names `ORGANISATION_CODE`.
export function readersOf(files: readonly { file: string; src: string }[]): string[] {
  return files.filter((f) => /\bORGANISATION_CODE\b/.test(lex(f.src))).map((f) => f.file);
}

describe("ORGANISATION_CODE is read only where nobody is signed in (ADR 0034 D10)", () => {
  const files = walk(SRC).map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
  const readers = readersOf(files);

  it("no file under src/ reads it outside the portal and the named readers", () => {
    expect(readers.filter((f) => !(f in MAY_READ) && !f.startsWith(PORTAL))).toEqual([]);
  });

  it("every named reader still reads it (the list cannot go stale)", () => {
    for (const f of Object.keys(MAY_READ)) expect(readers, f).toContain(f);
  });

  it("the scan sees a read, and not a mention in a comment or a string (self-test)", () => {
    expect(readersOf([{ file: "a.ts", src: 'import { ORGANISATION_CODE } from "@/lib/org";\nconst x = ORGANISATION_CODE;' }])).toEqual(["a.ts"]);
    expect(readersOf([{ file: "b.ts", src: '// ORGANISATION_CODE is not read here\nconst y = "ORGANISATION_CODE";' }])).toEqual([]);
  });
});

// ------------------------------------------------------------------ every load and write by id names the organisation

const APP = path.join(SRC, "app");
const METHODS = "findUnique|findFirst|update|delete|upsert|findUniqueOrThrow|findFirstOrThrow";

/// Exceptions, each marked `// tenant: via <parent>` above its call: file -> the parents named, in order. None today.
const VIA_PARENT: Readonly<Record<string, readonly string[]>> = {};

export interface TenantFinding {
  file: string;
  line: number;
  call: string;
  why: "UNFILTERED" | "UNREADABLE";
  via: string | null;
}

/// The top level of an object literal (lexed text): nested braces, brackets and parentheses blanked.
function topLevel(obj: string): string {
  let depth = 0;
  let out = "";
  for (const c of obj) {
    if ("({[".includes(c)) depth++;
    out += depth === 1 ? c : " ";
    if (")}]".includes(c)) depth--;
  }
  return out;
}

const CALL = new RegExp(String.raw`\b\w+\.(\w+)\.(${METHODS})\s*\(`, "g");

/// Every id-keyed Prisma call in a source whose `where` does not name the organisation, with the marker above it if any.
export function unfilteredById(file: string, src: string): TenantFinding[] {
  const m = lex(src);
  const lines = src.split("\n");
  const out: TenantFinding[] = [];
  for (const x of m.matchAll(CALL)) {
    const open = x.index! + x[0].length - 1;
    const arg = m.slice(open, closing(m, open) + 1);
    const w = /\bwhere\s*:\s*/.exec(arg);
    if (!w) continue;
    const ws = open + w.index + w[0].length;
    const line = src.slice(0, x.index).split("\n").length;
    const via = /\/\/\s*tenant:\s*via\s+(\S+)/.exec(lines[line - 2] ?? "")?.[1] ?? null;
    const call = `${x[1]}.${x[2]}`;
    if (m[ws] !== "{") {
      out.push({ file, line, call, why: "UNREADABLE", via });
      continue;
    }
    const where = m.slice(ws, closing(m, ws) + 1);
    const top = topLevel(where);
    if (!/[{,]\s*id\s*[:,}]/.test(top)) continue;
    if (/organisationId/.test(where)) continue;
    if (x[1] === "organisation" && /[{,]\s*id\s*:\s*[\w.]*(?:organisationId|orgId|org\.id)\s*[,}]/.test(top)) continue;
    out.push({ file, line, call, why: "UNFILTERED", via });
  }
  return out;
}

describe("every load and write by id in an action or route handler names the organisation (ADR 0034 D10)", () => {
  const appFiles = walk(APP)
    .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
    .map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
  const findings = appFiles.flatMap((f) => unfilteredById(f.file, f.src));

  it("reads every server action, route handler and shared helper under src/app (self-check of the file list)", () => {
    const names = appFiles.map((f) => f.file);
    for (const f of ["src/app/committees/actions.ts", "src/app/api/committees/decisions/[id]/votes/route.ts", "src/app/sourcing/[id]/window/shared.ts", "src/app/suppliers/routes.ts"]) expect(names).toContain(f);
  });

  it("no unfiltered or unreadable where outside a marked, named exception", () => {
    const bad = findings.filter((f) => !f.via || !(VIA_PARENT[f.file] ?? []).includes(f.via)).map((f) => `${f.file}:${f.line} ${f.call} (${f.why})`);
    expect(bad).toEqual([]);
  });

  it("every named exception is still marked in its file (the list cannot go stale)", () => {
    for (const [file, parents] of Object.entries(VIA_PARENT)) expect(findings.filter((f) => f.file === file && f.via).map((f) => f.via), file).toEqual(parents);
  });

  it("finds what it should, and passes what it should (self-test)", () => {
    const code = [
      "const a = await tx.bqItem.findFirst({ where: { id: itemId, section: { versionId: v.id } } });",
      "await tx.bqItem.delete({ where: { id: i.id } });",
      "await tx.bqItem.update({ where: { id, organisationId: actor.organisationId }, data: row });",
      "await tx.approvalStep.findFirst({ where: { id: stepId, instance: { organisationId: actor.organisationId } } });",
      "await tx.requisition.findUnique({ where: w });",
      "await tx.exerciseWindow.findUnique({ where: { exerciseId } });",
      "const o = await tx.organisation.findUniqueOrThrow({ where: { id: orgId } });",
      "const p = await tx.organisation.findUniqueOrThrow({ where: { id: someone } });",
      "// tenant: via exercise",
      "await tx.bqSection.delete({ where: { id: s.id } });",
      'const t = "tx.bqItem.delete({ where: { id: i.id } })";',
      "await db.bqItem.findMany({ where: { id: { in: ids } } });",
    ].join("\n");
    const got = unfilteredById("x.ts", code).map((f) => `${f.line} ${f.call} ${f.why} ${f.via ?? "-"}`);
    expect(got).toEqual(["1 bqItem.findFirst UNFILTERED -", "2 bqItem.delete UNFILTERED -", "5 requisition.findUnique UNREADABLE -", "8 organisation.findUniqueOrThrow UNFILTERED -", "10 bqSection.delete UNFILTERED exercise"]);
  });
});
