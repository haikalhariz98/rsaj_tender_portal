import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

import { OPERATIONS } from "./operations";
import { posixRelative, toPosix } from "@/lib/scan/files";

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
const walk = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n), ext) : ext.test(n) ? [toPosix(path.join(dir, n))] : []));

const WRITE = /\.(?:create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/;

/// Action files whose rule is their own, with the reason they are not proposals. Named by section, or by `section/file` for one file of a section.
const OWN_RULE: Record<string, string> = {
  "approval-matrix": "The approval matrix is drafted and issued by a non-maker (ADR 0034 D15, Phase 2c): `configuration.draft` for each edit, `configuration.issue` and the password for the issue, held by trigger `AuthorityMatrix_issue_guard`.",
  accounts: "Sign-in accounts are `accounts.manage`'s (Phase 1b), and an account's code is a two-person change of its own kind where it is an office holder's (Phase 2c).",
  changes: "The queue of changes: proposing the sign-in kinds and deciding every kind.",
  audit: "Reads the audit trail and exports it: it writes no configuration.",
};

/// Action files not yet moved, each with its reason. The list only shrinks: a file leaves it in the commit that moves it.
const NOT_YET: Record<string, string> = {};

interface ActionFile {
  dir: string;
  file: string;
  /// `actions.ts` -> `core.ts`, `form-actions.ts` -> `form-core.ts`; and the registry fragment beside it.
  core: string;
  operations: string;
}
const actionFiles: ActionFile[] = readdirSync(CONFIG)
  .filter((d) => statSync(path.join(CONFIG, d)).isDirectory() && !d.startsWith("_"))
  .flatMap((dir) =>
    readdirSync(path.join(CONFIG, dir))
      .filter((f) => /actions\.ts$/.test(f))
      .map((file) => ({ dir, file, core: file.replace(/actions\.ts$/, "core.ts"), operations: file.replace(/actions\.ts$/, "operations.ts") })),
  );
const sectionDirs = [...new Set(actionFiles.map((f) => f.dir))];
const isMoved = (f: ActionFile) => existsSync(path.join(CONFIG, f.dir, f.core)) && existsSync(path.join(CONFIG, f.dir, f.operations));
const key = (f: ActionFile) => (f.file === "actions.ts" ? f.dir : `${f.dir}/${f.file}`);
const known = (f: ActionFile) => OWN_RULE[key(f)] ?? OWN_RULE[f.dir] ?? NOT_YET[key(f)] ?? NOT_YET[f.dir];
const moved = actionFiles.filter(isMoved);

describe("every Configuration action file is a proposal, has a rule of its own, or is named as not moved yet", () => {
  it("finds the sections", () => {
    expect(sectionDirs.length).toBeGreaterThanOrEqual(20);
    expect(moved.length).toBeGreaterThanOrEqual(3);
  });

  it("leaves no file unclassified, and names no file twice or one that is gone", () => {
    expect(actionFiles.filter((f) => !isMoved(f) && !known(f)).map(key)).toEqual([]);
    for (const [k, why] of Object.entries({ ...OWN_RULE, ...NOT_YET })) {
      expect(actionFiles.some((f) => key(f) === k || f.dir === k), k).toBe(true);
      expect(why.length, k).toBeGreaterThan(20);
    }
    for (const f of moved) {
      expect(OWN_RULE[key(f)], `${key(f)} is moved and also named as having a rule of its own`).toBeUndefined();
      expect(NOT_YET[key(f)], `${key(f)} is moved and also named as not moved`).toBeUndefined();
    }
  });
});

describe("a moved file's actions hold no write, and each export proposes or asks its permission first", () => {
  it.each(moved.map((f) => [`${f.dir}/${f.file}`, f] as const))("%s: no Prisma write, no audit row and no transaction", (_name, f) => {
    const src = lex(read(path.join(CONFIG, f.dir, f.file)), { only: "comments" });
    expect(WRITE.test(src), `${f.dir}/${f.file} writes`).toBe(false);
    expect(src, `${f.dir}/${f.file}`).not.toMatch(/\bwriteAudit\s*\(|\.\$transaction\s*\(|\.\$queryRaw|\.\$executeRaw/);
  });

  it.each(moved.map((f) => [`${f.dir}/${f.file}`, f] as const))("%s: every export is a proposal of its own editor, or a direct wrapper that asks its permission first and calls its core", (_name, f) => {
    const src = read(path.join(CONFIG, f.dir, f.file));
    const prefix = /await stageEdit\("([\w-]+)\./.exec(src)?.[1] ?? null;
    const m = lex(src);
    const bad: string[] = [];
    for (const name of exportsOf(src)) {
      const span = spans(m).find((s) => s.name === name);
      if (!span) {
        bad.push(`${name}: not found`);
        continue;
      }
      const raw = src.slice(span.from, span.to);
      const at = m.slice(span.from, span.to).search(/\bawait\b/);
      const first = at < 0 ? "" : raw.slice(at, at + 100);
      const proposes = prefix != null && first.startsWith(`await stageEdit("${prefix}.${name}"`);
      const direct = /^await\s+(?:staffForPermission\(\s*"configuration\.(?:draft|issue)"\s*\)|requireStaff\(\))/.test(first) && raw.includes(`await core.${name}(`);
      if (!proposes && !direct) bad.push(`${f.dir}/${f.file}#${name}`);
    }
    expect(bad).toEqual([]);
  });

  it.each(moved.map((f) => [`${f.dir}/${f.file}`, f] as const))("%s: the registry names exactly the proposals, each loading the core export of its own name", (_name, f) => {
    const src = read(path.join(CONFIG, f.dir, f.file));
    const proposals = [...src.matchAll(/await stageEdit\("([\w-]+\.\w+)"/g)].map((x) => x[1]).sort();
    const prefixes = new Set(proposals.map((p) => p.slice(0, p.indexOf("."))));
    expect(prefixes.size).toBeLessThanOrEqual(1);
    const prefix = [...prefixes][0];
    const registered = prefix == null ? [] : Object.keys(OPERATIONS).filter((k) => k.startsWith(`${prefix}.`)).sort();
    expect(registered).toEqual(proposals);
    const ops = read(path.join(CONFIG, f.dir, f.operations));
    const coreStem = f.core.replace(/\.ts$/, "");
    for (const k of registered) {
      const name = k.slice(prefix.length + 1);
      expect(ops, k).toMatch(new RegExp(String.raw`\b${name}:\s*\{[^
]*load:[^
]*import\("\./${coreStem}"\)[^
]*m\.${name}\b`));
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
    for (const f of walk(path.join(ROOT, "src"), /\.(ts|tsx)$/).filter((x) => !/\.test\.tsx?$/.test(x) && !x.includes("/generated/"))) {
      const rel = posixRelative(CONFIG, f);
      const owner = /^([\w-]+)\/([\w-]*)(actions|operations)\.ts$/.exec(rel);
      for (const x of read(f).matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)) {
        const spec = x[1];
        if (!/(?:^|\/)(?:[\w-]+-)?core$/.test(spec)) continue;
        // A section's own action file and registry fragment reach their own core, written relative to themselves.
        if (owner && spec.startsWith("./")) continue;
        offenders.push(`${posixRelative(ROOT, f)} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no client component reaches an editor or the registry", () => {
    const clients = walk(path.join(ROOT, "src"), /\.tsx$/).filter((f) => /^\s*["']use client["']/.test(read(f)));
    expect(clients.length).toBeGreaterThan(20);
    const reaching = clients.filter((f) => /_editors\/operations|(?:^|[/-])core["']|\/operations["']/m.test(read(f)));
    expect(reaching.map((f) => posixRelative(ROOT, f))).toEqual([]);
  });
});
