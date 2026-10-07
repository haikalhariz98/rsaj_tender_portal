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
  // Phase 1d: added deliberately (decisions log, Phase 1d tests).
  "src/lib/demo/demo-additive.db.test.ts": "sets it for the demo loader it runs as a child process, as an operator would; it reads nothing itself",
};
/// The portal's own modules serve anonymous public pages (ADR 0034 D10 names `src/lib/portal/**`); none reads the constant today except through deployment.ts.
const PORTAL = "src/lib/portal/";

/// `ORGANISATION_NAME` (Phase 1c review): the environment's name for the deployment. A printed record names its issuer from the
/// organisation's own row (`exerciseOrg().name`), so a second organisation's certificates and award letters never carry the deployment's
/// name. The constant is read only where there is no row to read.
const MAY_READ_NAME: Readonly<Record<string, string>> = {
  "src/lib/org.ts": "it is defined here, from the environment",
  "src/lib/shell.ts": "the frame's name where there is no organisation row yet, or the database cannot be read; the frame only, never a printed record",
  "src/lib/auth/tenant.db.test.ts": "reads it only to prove that the name an award and a contract carry is the organisation's own, not this",
};

/// The files under src/ whose code (not their comments or strings) names the constant (`ORGANISATION_CODE` unless another is given).
export function readersOf(files: readonly { file: string; src: string }[], constant = "ORGANISATION_CODE"): string[] {
  const read = new RegExp(String.raw`\b${constant}\b`);
  return files.filter((f) => read.test(lex(f.src))).map((f) => f.file);
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

describe("ORGANISATION_NAME is read only where there is no organisation row to name (Phase 1c review)", () => {
  const files = walk(SRC).map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
  const readers = readersOf(files, "ORGANISATION_NAME");

  it("no file under src/ reads it outside the portal and the named readers", () => {
    expect(readers.filter((f) => !(f in MAY_READ_NAME) && !f.startsWith(PORTAL))).toEqual([]);
  });

  it("every named reader still reads it (the list cannot go stale)", () => {
    for (const f of Object.keys(MAY_READ_NAME)) expect(readers, f).toContain(f);
  });

  it("the scan sees a read of this constant and not of another (self-test)", () => {
    const src = 'import { ORGANISATION_NAME } from "@/lib/org";\nconst n = ORGANISATION_NAME;';
    expect(readersOf([{ file: "a.ts", src }], "ORGANISATION_NAME")).toEqual(["a.ts"]);
    expect(readersOf([{ file: "a.ts", src }])).toEqual([]);
  });
});

// ------------------------------------------------------------------ who may ask for the deployment's organisation

/**
 * `deploymentOrganisation()` and `loadPublicShell()` (`src/lib/portal/deployment.ts`) and `signInOrganisation()` (`src/lib/auth/deployment.ts`)
 * return the organisation the environment names, not the actor's. Code that runs after sign-in must not ask for it: once more than one
 * organisation can sign in, an act that did would read and write the deployment's rows for another organisation's user (threat F6). So
 * the modules that import either file are named here, each with its reason, and any other importer fails, as does a named one that no
 * longer imports (the list cannot go stale).
 *
 * Read: static imports and re-exports (`from "…"`), dynamic `import("…")`, by the `@/` alias or a relative path. Blind spots (declared):
 * test files, which mock the module; a module that reaches the deployment's organisation through an allowed importer (an action calling
 * `src/lib/portal/repo.ts`, say), which this scan does not follow; `require`.
 */
const DEPLOYMENT_MODULES: readonly string[] = ["src/lib/portal/deployment", "src/lib/auth/deployment"];

const MAY_IMPORT_DEPLOYMENT: Readonly<Record<string, string>> = {
  "src/app/layout.tsx": "the frame's organisation where nobody is signed in (the sign-in screens, the public pages); a signed-in actor's own otherwise",
  "src/app/organisation/logo/[sha]/route.ts": "the logo the frame shows where nobody is signed in; a signed-in actor's own organisation otherwise",
  "src/app/_auth/loader.ts": "a loader script's acts, where nobody is signed in to name an organisation",
  "src/app/sign-in/page.tsx": "the sign-in screen names its policy before anyone has signed in",
  "src/app/sign-in/code/page.tsx": "the one-time-code screen names its policy before anyone has signed in",
  "src/app/supplier/page.tsx": "an anonymous public page",
  "src/app/supplier/opportunities/page.tsx": "an anonymous public page",
  "src/app/supplier/results/page.tsx": "an anonymous public page",
  "src/app/supplier/register/page.tsx": "an anonymous public page",
  "src/app/supplier/register/receive.ts": "the public registration form's one POST, which nobody signed in sends",
  "src/lib/auth/deployment.ts": "the sign-in screens' name for the deployment's organisation",
  "src/lib/auth/identity.ts": "signing in: the organisation whose policy and accounts a sign-in is checked against, before there is an actor",
  "src/lib/auth/account-store.ts": "using a one-time code: as signing in, before there is an actor",
  "src/lib/portal/repo.ts": "the public pages' loaders (ADR 0034 D10)",
  "src/lib/portal/apply-repo.ts": "the public registration form's loader (ADR 0034 D10)",
};

/// The modules a source imports, resolved to repository paths without their extension (`@/x` is `src/x`; `./x` is relative to the file).
export function importsOf(file: string, src: string): string[] {
  const code = lex(src, { only: "comments" });
  const out: string[] = [];
  for (const x of code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)) {
    const spec = x[1];
    const p = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? path.posix.join(path.posix.dirname(file), spec) : null;
    if (p) out.push(p.replace(/\.(ts|tsx|js)$/, "").replace(/\/index$/, ""));
  }
  return out;
}

/// The files that import either deployment module (the portal's own, which defines the organisation, excepted).
export function deploymentImporters(files: readonly { file: string; src: string }[]): string[] {
  return files
    .filter((f) => f.file !== "src/lib/portal/deployment.ts")
    .filter((f) => importsOf(f.file, f.src).some((m) => DEPLOYMENT_MODULES.includes(m)))
    .map((f) => f.file);
}

describe("only the pre-sign-in code asks for the deployment's organisation (Phase 1c review, threat F6)", () => {
  const files = walk(SRC)
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
  const importers = deploymentImporters(files);

  it("no file imports the deployment modules outside the named importers", () => {
    expect(importers.filter((f) => !(f in MAY_IMPORT_DEPLOYMENT))).toEqual([]);
  });

  it("every named importer still imports one (the list cannot go stale)", () => {
    for (const f of Object.keys(MAY_IMPORT_DEPLOYMENT)) expect(importers, f).toContain(f);
  });

  it("sees static, dynamic and relative imports, and not a mention in a comment or a string (self-test)", () => {
    const cases = [
      { file: "src/app/a/actions.ts", src: 'import { deploymentOrganisation } from "@/lib/portal/deployment";' },
      { file: "src/app/b/actions.ts", src: 'const { deploymentOrganisation } = await import("@/lib/portal/deployment");' },
      { file: "src/lib/auth/c.ts", src: 'import { signInOrganisation } from "./deployment";' },
      { file: "src/lib/portal/d.ts", src: 'import type { DeploymentOrganisation } from "./deployment.ts";' },
      { file: "src/app/e/actions.ts", src: 'export { loadPublicShell } from "../../lib/portal/deployment";' },
      { file: "src/app/f/actions.ts", src: '// see "@/lib/portal/deployment"\nimport { x } from "@/lib/deployment";\nconst s = "./deployment";' },
      { file: "src/lib/g/h.ts", src: 'import { y } from "./deployment";' },
    ];
    expect(deploymentImporters(cases)).toEqual(["src/app/a/actions.ts", "src/app/b/actions.ts", "src/lib/auth/c.ts", "src/lib/portal/d.ts", "src/app/e/actions.ts"]);
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
