import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

import { OPERATIONS } from "./operations";

/**
 * Every Configuration editor but the sign-in ones proposes, and nothing in a screen's own action writes a configuration table (sign-in programme Phase 5b, the plan's
 * scan: "no configuration editor writes a configuration table except through the issue path or the ConfigurationChange applier").
 *
 * The shape that holds it: a section's `actions.ts` is only what a browser can call, and holds no write. Each export is one of
 * - a PROPOSAL (`stageEdit("<section>.<name>", ...)`): the editor is `core.ts`, run only by the machinery, when the proposal is rehearsed and when a second person applies it;
 * - a DIRECT wrapper (a draft edited by its maker, a draft's issue by a non-maker): it asks its permission first and calls `core.ts`, which holds the rule of the draft.
 * `core.ts` is imported by nothing but its own `actions.ts` and `operations.ts`. A section that is neither is named below with its reason; a new section that is none of
 * the three fails here, which is the point.
 */

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, "src", "app", "configuration");
const read = (f: string) => readFileSync(f, "utf8");
const exportsOf = (src: string) => [...src.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);
const walk = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n), ext) : ext.test(n) ? [path.join(dir, n)] : []));

const WRITE = /\.(?:create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/;

/// Sections whose rule is their own, with the reason they are not proposals.
const OWN_RULE: Record<string, string> = {
  "approval-matrix": "The approval matrix is drafted and issued by a non-maker (ADR 0034 D15, Phase 2c): `configuration.draft` for each edit, `configuration.issue` and the password for the issue, held by trigger `AuthorityMatrix_issue_guard`.",
  accounts: "Sign-in accounts are `accounts.manage`'s (Phase 1b), and an account's code is a two-person change of its own kind where it is an office holder's (Phase 2c).",
  changes: "The queue of changes: proposing the sign-in kinds and deciding every kind.",
  audit: "Reads the audit trail and exports it: it writes no configuration.",
};

/// Sections not yet moved, each with its reason. The list only shrinks: a section leaves it in the commit that moves it.
const NOT_YET: Record<string, string> = {
  awards: "Moves in the next commit of Phase 5b.",
  budget: "Moves in a commit of its own (its panels call actions that are not forms).",
  committees: "Moves in a commit of its own (the quorum is a kind of its own, 5a).",
  contracts: "Moves in the next commit of Phase 5b.",
  documents: "Moves in a commit of its own (a classification downgrade is a kind of its own, 5a).",
  invitation: "Moves in the next commit of Phase 5b.",
  notifications: "Moves in the next commit of Phase 5b.",
  organisation: "Moves in a commit of its own (its images are files).",
  "post-award": "Moves in the next commit of Phase 5b.",
  "reference-data": "Moves in the next commit of Phase 5b.",
  requisitions: "Moves in the next commit of Phase 5b.",
  "routing-sheets": "Moves in the next commit of Phase 5b.",
  suppliers: "Moves in the next commit of Phase 5b.",
  templates: "Moves in a commit of its own (three action files).",
  "tender-documents": "Moves in the next commit of Phase 5b.",
  users: "Moves in a commit of its own (people and assignments).",
};

const sectionDirs = readdirSync(CONFIG)
  .filter((d) => statSync(path.join(CONFIG, d)).isDirectory() && !d.startsWith("_"))
  .filter((d) => readdirSync(path.join(CONFIG, d)).some((f) => /actions\.ts$/.test(f)));
const isStaged = (d: string) => existsSync(path.join(CONFIG, d, "core.ts")) && existsSync(path.join(CONFIG, d, "operations.ts"));
const moved = sectionDirs.filter(isStaged);

describe("every Configuration section is a proposal, has a rule of its own, or is named as not moved yet", () => {
  it("finds the sections", () => {
    expect(sectionDirs.length).toBeGreaterThanOrEqual(20);
    expect(moved.length).toBeGreaterThanOrEqual(3);
  });

  it("leaves no section unclassified, and names no section twice or one that is gone", () => {
    expect(sectionDirs.filter((d) => !isStaged(d) && !OWN_RULE[d] && !NOT_YET[d])).toEqual([]);
    for (const [d, why] of Object.entries({ ...OWN_RULE, ...NOT_YET })) {
      expect(sectionDirs, d).toContain(d);
      expect(why.length, d).toBeGreaterThan(20);
    }
    for (const d of moved) {
      expect(OWN_RULE[d], `${d} is moved and also named as having a rule of its own`).toBeUndefined();
      expect(NOT_YET[d], `${d} is moved and also named as not moved`).toBeUndefined();
    }
  });
});

describe("a moved section's actions hold no write, and each export proposes or asks its permission first", () => {
  it.each(moved)("%s: the action files hold no Prisma write, no audit row and no transaction", (d) => {
    for (const f of readdirSync(path.join(CONFIG, d)).filter((x) => /actions\.ts$/.test(x))) {
      const src = lex(read(path.join(CONFIG, d, f)), { only: "comments" });
      expect(WRITE.test(src), `${d}/${f} writes`).toBe(false);
      expect(src, `${d}/${f}`).not.toMatch(/\bwriteAudit\s*\(|\.\$transaction\s*\(|\.\$queryRaw|\.\$executeRaw/);
    }
  });

  it.each(moved)("%s: every export is a proposal of its own editor, or a direct wrapper that asks its permission first and calls its core", (d) => {
    const src = read(path.join(CONFIG, d, "actions.ts"));
    const m = lex(src);
    const bad: string[] = [];
    for (const name of exportsOf(src)) {
      const span = spans(m).find((s) => s.name === name);
      if (!span) {
        bad.push(`${d}/${name}: not found`);
        continue;
      }
      const raw = src.slice(span.from, span.to);
      const at = m.slice(span.from, span.to).search(/\bawait\b/);
      const first = at < 0 ? "" : raw.slice(at, at + 100);
      const proposes = first.startsWith(`await stageEdit("${d}.${name}"`);
      const direct = /^await\s+(?:staffForPermission\(\s*"configuration\.(?:draft|issue)"\s*\)|requireStaff\(\))/.test(first) && raw.includes(`await core.${name}(`);
      if (!proposes && !direct) bad.push(`${d}/${name}`);
    }
    expect(bad).toEqual([]);
  });

  it.each(moved)("%s: the registry names exactly the proposals, each loading the core export of its own name", (d) => {
    const proposals = [...read(path.join(CONFIG, d, "actions.ts")).matchAll(/await stageEdit\("([\w-]+\.\w+)"/g)].map((x) => x[1]).sort();
    const registered = Object.keys(OPERATIONS)
      .filter((k) => k.startsWith(`${d}.`))
      .sort();
    expect(registered).toEqual(proposals);
    const ops = read(path.join(CONFIG, d, "operations.ts"));
    for (const k of registered) {
      const name = k.slice(d.length + 1);
      expect(ops, k).toMatch(new RegExp(String.raw`\b${name}:\s*\{[^\n]*load:[^\n]*m\.${name}\b`));
    }
  });
});

describe("a proposal asks first, and an editor is reached only by the machinery", () => {
  it("stageEdit asks the drafting permission as its first awaited call, and then the Origin guard", () => {
    const file = path.join(ROOT, "src", "app", "_auth", "stage.ts");
    const raw = read(file);
    const m = lex(raw);
    const span = spans(m).find((s) => s.name === "stageEdit")!;
    const body = raw.slice(span.from, span.to);
    expect(body).toMatch(/^\{\s*const guard = await staffForPermission\("configuration\.draft"\);\s*if \(!guard\.ok\) return guard\.state;\s*if \(await refuseForeignPost\(\)\)/);
  });

  it("nothing imports an editor's core but its own section's actions and registry fragment", () => {
    const offenders: string[] = [];
    for (const f of walk(path.join(ROOT, "src"), /\.(ts|tsx)$/).filter((x) => !/\.test\.tsx?$/.test(x) && !x.includes(`${path.sep}generated${path.sep}`))) {
      const rel = path.relative(CONFIG, f).split(path.sep).join("/");
      const owner = /^([\w-]+)\/([\w-]*)(actions|operations)\.ts$/.exec(rel);
      for (const x of read(f).matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)) {
        const spec = x[1];
        if (!/(?:^|\/)(?:[\w-]+-)?core$/.test(spec)) continue;
        // A section's own action file and registry fragment reach their own core, written relative to themselves.
        if (owner && spec.startsWith("./")) continue;
        offenders.push(`${path.relative(ROOT, f)} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no client component reaches an editor or the registry", () => {
    const clients = walk(path.join(ROOT, "src"), /\.tsx$/).filter((f) => /^\s*["']use client["']/.test(read(f)));
    expect(clients.length).toBeGreaterThan(20);
    const reaching = clients.filter((f) => /_editors\/operations|(?:^|[/-])core["']|\/operations["']/m.test(read(f)));
    expect(reaching.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
