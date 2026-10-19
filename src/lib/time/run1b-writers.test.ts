import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, rawCallText, rawCalls, spans } from "@/lib/scan/source";
import { toPosix } from "@/lib/scan/files";

/**
 * 6.13 Part B run 1b (design note §9): each new table has its named writers, file#function, and no other code writes it.
 * The table below is the design note's; a writer named for a later commit of the run (C9–C12) is allowed before it
 * exists, and the "built so far" test holds what each commit has built, so a writer cannot appear unnamed.
 *
 * Blind spots, declared: a write through a variable delegate (`tx[name]`); a write in a file outside src/ and prisma/;
 * a write inside an anonymous function at the top level of a module (reported as "(top level)", which no entry names,
 * so it fails closed). A nested relation write inside another model's write is read (the relation fields to these models
 * are taken from the schema), and raw SQL naming one of these tables with an INSERT, UPDATE or DELETE fails; a row lock
 * (`FOR UPDATE`) is a read.
 */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

const MODELS = ["DelayNotice", "EotClaimNotice", "EotClaim", "EotReason", "ExtensionOfTime", "LossExpenseClaim", "PeriodExtension", "PeriodAgreement", "LadWaiver"] as const;
type Model = (typeof MODELS)[number];

const TIME = "src/app/projects/[id]/time-actions.ts";
const DAMAGES = "src/app/projects/[id]/damages-actions.ts";
const PAYMENT = "src/app/projects/[id]/payment-actions.ts";
const AT_ISSUE = "src/lib/time/at-issue.ts";

/// The design note's §9, file#function.
const WRITERS: Readonly<Record<Model, readonly string[]>> = {
  DelayNotice: [`${TIME}#recordDelayNotice`],
  EotClaim: [`${TIME}#openEotClaim`, `${TIME}#answerEotClaim`, `${TIME}#determineEotClaim`, `${TIME}#sendEotClaim`],
  EotClaimNotice: [`${TIME}#openEotClaim`],
  EotReason: [`${TIME}#addEotReason`, `${TIME}#removeEotReason`],
  ExtensionOfTime: [`${TIME}#raiseEotCertificate`, `${AT_ISSUE}#eotAtIssue`],
  LossExpenseClaim: [`${TIME}#answerEotClaim`, `${TIME}#recordLossExpense`, `${TIME}#valueLossExpense`, `${TIME}#sendLossExpense`],
  PeriodExtension: [`${TIME}#recordPeriodExtension`, `${TIME}#sendPeriodExtension`],
  PeriodAgreement: [`${TIME}#raisePeriodAgreement`, `${AT_ISSUE}#periodAtIssue`],
  LadWaiver: [`${DAMAGES}#recordLadWaiver`, `${DAMAGES}#sendLadWaiver`, `${DAMAGES}#resendLadWaiver`, `${PAYMENT}#raiseInterimCertificate`],
};

const delegateOf = (m: string) => m[0].toLowerCase() + m.slice(1);
const OPS = "create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany";
const NESTED = "create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set|disconnect";

/// The relation fields of other models that point to one of these, from the schema: a nested write through one is a write.
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

/// A raw call's text writes one of these tables (a lock is a read).
const rawWrites = (text: string): Model[] => {
  const writes = /\b(INSERT|UPDATE|DELETE)\b/i.test(text.replace(/\bFOR\s+(?:NO\s+KEY\s+)?(?:UPDATE|SHARE)\b/gi, ""));
  return writes ? MODELS.filter((m) => text.includes(`"${m}"`)) : [];
};

/// Every write to these models in one source, as model → file#outermost function.
const UNREADABLE = "an unreadable raw call";
function writesOf(file: string, src: string, relations: ReadonlyMap<string, Model> = RELATIONS): { model: Model | typeof UNREADABLE; at: string }[] {
  const m = lex(src);
  const sp = spans(m);
  const outer = (pos: number) => sp.filter((s) => s.from <= pos && pos <= s.to).sort((a, b) => b.to - b.from - (a.to - a.from))[0]?.name ?? "(top level)";
  const out: { model: Model | typeof UNREADABLE; at: string }[] = [];
  for (const model of MODELS) for (const x of m.matchAll(new RegExp(`\\.${delegateOf(model)}\\.(?:${OPS})\\(`, "g"))) out.push({ model, at: `${file}#${outer(x.index!)}` });
  for (const [field, model] of relations) for (const x of m.matchAll(new RegExp(`\\b${field}\\s*:\\s*\\{\\s*(?:${NESTED})\\s*:`, "g"))) out.push({ model, at: `${file}#${outer(x.index!)}` });
  for (const c of rawCalls(m)) {
    const text = rawCallText(src, m, c);
    // An unreadable raw call (its SQL not in the source) fails closed: no writer is named for it.
    if (text === null) out.push({ model: UNREADABLE, at: `${file}#${outer(c.at)}` });
    else for (const model of rawWrites(text)) out.push({ model, at: `${file}#${outer(c.at)}` });
  }
  return out;
}

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    if (rel === path.normalize("src/generated")) return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.(m?[jt]sx?)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [toPosix(rel)] : [];
  });
}

describe("the writer scan's self-test", () => {
  const rel = new Map<string, Model>([["reasons", "EotReason"]]);
  it("a delegate write, a nested write and a raw write are found, in their outermost function; an unreadable raw call fails closed; a lock and a read are not", () => {
    const src = [
      "export async function act(d) { return inContract(d, async (c) => { await c.tx.eotClaim.updateMany({}); await c.tx.delayNotice.findMany({}); }); }",
      "export async function other() { await tx.contract.update({ data: { reasons: { create: [] } } }); }",
      'async function raw(tx) { await tx.$executeRaw`UPDATE "LadWaiver" SET x = 1`; await tx.$queryRaw`SELECT id FROM "EotClaim" WHERE id = 1 FOR UPDATE`; }',
      "// tx.ladWaiver.create( in a comment is not code",
      "export async function opaque(tx, q) { await tx.$queryRawTyped(q); }",
    ].join("\n");
    expect(writesOf("x.ts", src, rel).map((w) => `${w.model} ${w.at}`)).toEqual(["EotClaim x.ts#act", "EotReason x.ts#other", "LadWaiver x.ts#raw", "an unreadable raw call x.ts#opaque"]);
  });
  it("the schema's relation fields to these models are read (a nested write through one is seen)", () => {
    expect(RELATIONS.size).toBeGreaterThan(5);
    expect([...RELATIONS.values()]).toEqual(expect.arrayContaining(["EotClaim", "EotReason", "LadWaiver", "ExtensionOfTime"]));
  });
});

describe("one named writer per run 1b table (design note §9)", () => {
  const all = [...files("src"), ...files("prisma"), ...files("scripts")].flatMap((f) => writesOf(f, readFileSync(path.join(ROOT, f), "utf8")));
  it("every write to a run 1b table is in a writer the design note names", () => {
    expect(all.filter((w) => w.model === UNREADABLE || !WRITERS[w.model].includes(w.at)).map((w) => `${w.model} ${w.at}`)).toEqual([]);
  });
  it("built so far (C8): the notice, the claim and its notices and reasons, and the pack's loss-and-expense estimate", () => {
    const built = new Set(all.map((w) => `${w.model} ${w.at}`));
    for (const w of [
      `DelayNotice ${TIME}#recordDelayNotice`,
      `EotClaim ${TIME}#openEotClaim`,
      `EotClaimNotice ${TIME}#openEotClaim`,
      `EotClaim ${TIME}#answerEotClaim`,
      `LossExpenseClaim ${TIME}#answerEotClaim`,
      `EotReason ${TIME}#addEotReason`,
      `EotReason ${TIME}#removeEotReason`,
      `EotClaim ${TIME}#determineEotClaim`,
    ])
      expect(built.has(w), w).toBe(true);
  });
});
