import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { toPosix } from "@/lib/scan/files";
import { lex, rawCallText, rawCalls, spans } from "@/lib/scan/source";

/**
 * Phase 2 close-out stage B (plan closeout-plan.md §6.2, single-writer scans): each new table has its named writers, file#function, and no other
 * code writes it. The retention release keeps its one writer here (stage C adds the final certificate's payment). As run1b-writers.test.ts:
 * a delegate write, a nested relation write, and raw SQL that inserts into, updates or deletes from one of these tables (a lock is a read).
 */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const MODELS = ["PracticalCompletion", "DefectItem", "DefectEvent", "DefectSchedule", "MakingGood", "SecurityRelease", "RetentionRelease"] as const;
type Model = (typeof MODELS)[number];

const ACTS = "src/app/projects/[id]/closeout-actions.ts";
const AT_ISSUE = "src/lib/closeout/at-issue.ts";
const PORTAL = "src/lib/portal/projects/defect-store.ts";
const WRITERS: Readonly<Record<Model, readonly string[]>> = {
  PracticalCompletion: [`${ACTS}#raisePracticalCompletion`, `${AT_ISSUE}#cpcAtIssue`],
  DefectItem: [`${ACTS}#addCpcDefect`, `${ACTS}#removeCpcDefect`, `${ACTS}#reportDefect`],
  DefectEvent: [`${ACTS}#onDefect`, `${PORTAL}#reportRectifiedAsContractor`],
  DefectSchedule: [`${ACTS}#raiseDefectSchedule`, `${AT_ISSUE}#scheduleAtIssue`],
  MakingGood: [`${ACTS}#raiseMakingGood`, `${AT_ISSUE}#cmgdAtIssue`],
  SecurityRelease: [`${ACTS}#returnSecurity`],
  RetentionRelease: ["src/app/projects/[id]/payment-actions.ts#releaseRetention"],
};

const delegateOf = (m: string) => m[0].toLowerCase() + m.slice(1);
const OPS = "create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany";
const NESTED = "create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set|disconnect";

function relationFields(src: string): Map<string, Model> {
  const out = new Map<string, Model>();
  for (const block of src.matchAll(/\nmodel (\w+) \{([\s\S]*?)\n\}/g)) {
    for (const line of block[2].split("\n")) {
      const f = /^\s+(\w+)\s+(\w+)(\[\]|\?)?(\s|$)/.exec(line);
      if (f && (MODELS as readonly string[]).includes(f[2])) out.set(f[1], f[2] as Model);
    }
  }
  return out;
}
const RELATIONS = relationFields(schema);

function writesOf(file: string, src: string): { model: string; at: string }[] {
  const m = lex(src);
  const sp = spans(m);
  const outer = (pos: number) => sp.filter((s) => s.from <= pos && pos <= s.to).sort((a, b) => b.to - b.from - (a.to - a.from))[0]?.name ?? "(top level)";
  const out: { model: string; at: string }[] = [];
  for (const model of MODELS) for (const x of m.matchAll(new RegExp(`\\.${delegateOf(model)}\\.(?:${OPS})\\(`, "g"))) out.push({ model, at: `${file}#${outer(x.index!)}` });
  for (const [field, model] of RELATIONS) for (const x of m.matchAll(new RegExp(`\\b${field}\\s*:\\s*\\{\\s*(?:${NESTED})\\s*:`, "g"))) out.push({ model, at: `${file}#${outer(x.index!)}` });
  for (const c of rawCalls(m)) {
    const text = rawCallText(src, m, c);
    if (text === null) {
      out.push({ model: "an unreadable raw call", at: `${file}#${outer(c.at)}` });
      continue;
    }
    if (/\b(INSERT|UPDATE|DELETE)\b/i.test(text.replace(/\bFOR\s+(?:NO\s+KEY\s+)?(?:UPDATE|SHARE)\b/gi, ""))) for (const model of MODELS.filter((x) => text.includes(`"${x}"`))) out.push({ model, at: `${file}#${outer(c.at)}` });
  }
  return out;
}

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    if (rel === path.normalize("src/generated")) return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.(m?[jt]sx?)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith(".fixture.ts") ? [toPosix(rel)] : [];
  });
}

describe("one named writer per close-out table (plan §6.2)", () => {
  const all = [...files("src"), ...files("prisma"), ...files("scripts")].flatMap((f) => writesOf(f, readFileSync(path.join(ROOT, f), "utf8")));
  it("every write is in a writer named here", () => {
    expect(all.filter((w) => !(WRITERS as Record<string, readonly string[]>)[w.model]?.includes(w.at)).map((w) => `${w.model} ${w.at}`)).toEqual([]);
  });
  it("every writer named here writes its table", () => {
    const seen = new Set(all.map((w) => `${w.model} ${w.at}`));
    for (const [model, at] of Object.entries(WRITERS)) for (const a of at) expect(seen.has(`${model} ${a}`), `${model} ${a}`).toBe(true);
  });
});
