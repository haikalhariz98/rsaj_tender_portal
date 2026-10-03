import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { closing, enclosingFn, lex, spans } from "@/lib/scan/source";

/**
 * 615-C2 (BD-613-91): one writer of a registration cancelled, held by a source scan. Standing events are append-only
 * (ADR 0019): the product creates them in its standing acts and never updates or deletes one, except the withdrawal of
 * a cancellation recorded in error, which writes only the three withdrawal columns. Concretely:
 * - a REGISTRATION_CANCELLED event is created only by `recordRegistrationCancelled`, with the kind a literal, and that
 *   act creates nothing else; every other create names a literal kind that is not REGISTRATION_CANCELLED;
 * - the body, its label and the body's reference are written only there;
 * - the only update of a standing event is `withdrawRegistrationCancelled`'s, writing withdrawnAt, withdrawnReason and
 *   withdrawnByPersonId and nothing else; no product code deletes one;
 * - the demo (prisma/) writes standing events only in its own named loaders and wipe, never a cancellation.
 * Sources are lexed (comments, strings, templates blanked) and each write is credited to its enclosing function.
 */

const ROOT = path.join(__dirname, "../../..");
const ACTS = path.normalize("src/app/suppliers/standing-actions.ts");
function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    if (rel === path.normalize("src/generated")) return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}
const SOURCES = [...files("src/app"), ...files("src/lib"), ...files("prisma")].map((file) => ({ file, src: readFileSync(path.join(ROOT, file), "utf8") }));

type Write = { where: string; op: string; problem: string | null };

const WITHDRAW_KEYS = ["withdrawnAt", "withdrawnReason", "withdrawnByPersonId"];
const CANCEL_KEYS = ["cancellingBodyId", "bodyLabelSnapshot", "externalReference"];

/// The top-level keys of an object literal's text (lexed), or null when it is not an inline literal without a spread.
function keysOf(lexed: string): string[] | null {
  const t = lexed.trim();
  if (!t.startsWith("{")) return null;
  const inner = t.slice(1, closing(t, 0));
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= inner.length; i++) {
    const ch = inner[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    if ((ch === "," && depth === 0) || i === inner.length) {
      const part = inner.slice(start, i).trim();
      start = i + 1;
      if (!part) continue;
      // A spread or a computed key at the top level cannot be read.
      const k = /^["']?(\w+)["']?\s*(?::|$)/.exec(part);
      if (!k) return null;
      out.push(k[1]);
    }
  }
  return out;
}

/// The value text of `key` in an inline object literal (raw source between the same offsets as the lexed text).
function valueOf(lexed: string, raw: string, key: string): string | null {
  const m = new RegExp(`(?:^|[{,\\s])["']?${key}["']?\\s*:`).exec(lexed);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 0;
  const from = i;
  for (; i < lexed.length; i++) {
    const ch = lexed[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      if (depth === 0) break;
      depth--;
    } else if (ch === "," && depth === 0) break;
  }
  return raw.slice(from, i).trim();
}

export function scanStandingWrites(sources: readonly { file: string; src: string }[]): Write[] {
  const out: Write[] = [];
  for (const { file, src } of sources) {
    const m = lex(src);
    const sp = spans(m);
    const demo = file.startsWith("prisma");
    // A handle taken, destructured or by name: unreadable.
    // On a client (tx, db, client, prisma): a row's relation read (`a.standingEvent`) or the audit's entity map is not one.
    for (const x of m.matchAll(/\b(tx|db|client|prisma)\s*\.\s*standingEvent\b(?!\s*\??\.\s*\w+\s*\()/g)) out.push({ where: `${file} › ${enclosingFn(sp, x.index!)}`, op: "standingEvent handle", problem: "the model handle taken" });
    for (const x of lex(src, { only: "comments" }).matchAll(/\[\s*["'`]standingEvent["'`]\s*\]/g)) out.push({ where: `${file} › ${enclosingFn(sp, x.index!)}`, op: "standingEvent by name", problem: "the model taken by name" });
    for (const x of m.matchAll(/\{\s*[^{}]*\bstandingEvent\b[^{}]*\}\s*=\s*\w/g)) out.push({ where: `${file} › ${enclosingFn(sp, x.index!)}`, op: "standingEvent destructured", problem: "the model handle taken" });
    for (const x of m.matchAll(/\.\s*standingEvent\s*\??\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g)) {
      const op = x[1];
      const open = x.index! + x[0].length - 1;
      const close = closing(m, open);
      const argsLex = m.slice(open + 1, close);
      const argsRaw = src.slice(open + 1, close);
      const fn = enclosingFn(sp, x.index!);
      const where = `${file} › ${fn}`;
      const name = `standingEvent.${op}`;
      const keys = keysOf(argsLex);
      if (!keys) {
        out.push({ where, op: name, problem: "arguments not an inline object" });
        continue;
      }
      const dataLex = valueOf(argsLex, argsLex, "data");
      const dataRaw = valueOf(argsLex, argsRaw, "data");
      if (op.startsWith("delete")) {
        out.push({ where, op: name, problem: demo ? null : "a standing event deleted" });
        continue;
      }
      const dataKeys = dataLex != null ? keysOf(dataLex) : null;
      if (dataLex == null || !dataKeys) {
        out.push({ where, op: name, problem: "data not an inline object literal" });
        continue;
      }
      if (op.startsWith("create") || op === "upsert") {
        const kind = valueOf(dataLex, dataRaw!, "kind");
        const literal = kind ? /^"([A-Z_]+)"$/.exec(kind)?.[1] ?? null : null;
        let problem: string | null = null;
        if (op !== "create") problem = "not a single create";
        else if (!literal) problem = "kind not a literal";
        else if (literal === "REGISTRATION_CANCELLED" && (demo || !(file === ACTS && fn === "recordRegistrationCancelled"))) problem = "creates a registration cancelled outside its writer";
        else if (literal !== "REGISTRATION_CANCELLED" && file === ACTS && fn === "recordRegistrationCancelled") problem = "the cancellation's writer creates another kind";
        else if (dataKeys.some((k) => CANCEL_KEYS.includes(k)) && literal !== "REGISTRATION_CANCELLED") problem = "writes a cancellation's body or reference";
        else if (dataKeys.some((k) => WITHDRAW_KEYS.includes(k))) problem = "creates an event withdrawn";
        out.push({ where, op: `${name} ${literal ?? "?"}`, problem });
        continue;
      }
      // An update: only the withdrawal, only its three columns; the demo's wipe may clear the links it then deletes.
      let problem: string | null = null;
      if (demo) problem = dataKeys.every((k) => k === "reinstatesEventId" || k === "liftsEventId") ? null : "the demo updates a standing event";
      else if (!(file === ACTS && fn === "withdrawRegistrationCancelled")) problem = "a standing event updated outside the withdrawal";
      else if (!dataKeys.every((k) => WITHDRAW_KEYS.includes(k)) || dataKeys.length !== WITHDRAW_KEYS.length) problem = "the withdrawal writes more than its three columns";
      out.push({ where, op: name, problem });
    }
  }
  return out;
}

describe("one writer of a registration cancelled (615-C2), standing events append-only", () => {
  const found = scanStandingWrites(SOURCES);

  it("no write is a problem", () => {
    expect(found.filter((w) => w.problem).map((w) => `${w.where} · ${w.op} · ${w.problem}`)).toEqual([]);
  });

  it("the writers are exactly these (the list cannot go stale)", () => {
    const writers = [...new Set(found.map((w) => `${w.where} · ${w.op}`))].sort();
    expect(writers).toEqual(
      [
        `${ACTS} › suspendSupplier · standingEvent.create SUSPEND`,
        `${ACTS} › reinstateSupplier · standingEvent.create REINSTATE`,
        `${ACTS} › recordFromRequest · standingEvent.create BLACKLIST`,
        `${ACTS} › recordFromRequest · standingEvent.create BLACKLIST_LIFT`,
        `${ACTS} › recordRegistrationCancelled · standingEvent.create REGISTRATION_CANCELLED`,
        `${ACTS} › withdrawRegistrationCancelled · standingEvent.updateMany`,
        `${path.normalize("prisma/demo-suppliers.ts")} › suspend · standingEvent.create SUSPEND`,
        `${path.normalize("prisma/demo-suppliers.ts")} › recordBlacklisting · standingEvent.create BLACKLIST`,
        `${path.normalize("prisma/demo-suppliers.ts")} › wipeSuppliersDemo · standingEvent.updateMany`,
        `${path.normalize("prisma/demo-suppliers.ts")} › wipeSuppliersDemo · standingEvent.deleteMany`,
      ].sort(),
    );
  });

  it("the withdrawal moves only a live cancellation (its where names the kind and that it is not withdrawn)", () => {
    const acts = readFileSync(path.join(ROOT, ACTS), "utf8");
    const body = acts.slice(acts.indexOf("export async function withdrawRegistrationCancelled"));
    expect(body).toMatch(/standingEvent\.updateMany\(\{ where: \{ id: [\w.!]+, kind: "REGISTRATION_CANCELLED", withdrawnAt: null \}/);
    expect(body).toMatch(/if \(moved\.count !== 1\) throw new Refusal\(CHANGED\)/);
  });
});

describe("the scan catches each evasion (self-tests)", () => {
  const one = (src: string, file = ACTS) => scanStandingWrites([{ file, src }]).filter((w) => w.problem).map((w) => `${w.where.split(" › ")[1]} · ${w.op} · ${w.problem}`);
  const fn = (name: string, body: string) => `export async function ${name}(tx) {\n  ${body}\n}\n`;
  it("a cancellation created elsewhere, or by the demo", () => {
    expect(one(fn("suspendSupplier", `await tx.standingEvent.create({ data: { kind: "REGISTRATION_CANCELLED", cancellingBodyId: b } });`))).toEqual(["suspendSupplier · standingEvent.create REGISTRATION_CANCELLED · creates a registration cancelled outside its writer"]);
    expect(one(fn("load", `await db.standingEvent.create({ data: { kind: "REGISTRATION_CANCELLED" } });`), path.normalize("prisma/demo-suppliers.ts"))).toEqual(["load · standingEvent.create REGISTRATION_CANCELLED · creates a registration cancelled outside its writer"]);
  });
  it("a kind not a literal, a spread, data in a variable, a createMany", () => {
    expect(one(fn("x", "await tx.standingEvent.create({ data: { kind } });"))).toEqual(["x · standingEvent.create ? · kind not a literal"]);
    expect(one(fn("x", "await tx.standingEvent.create({ data: { ...d, kind: \"SUSPEND\" } });"))).toEqual(["x · standingEvent.create · data not an inline object literal"]);
    expect(one(fn("x", "await tx.standingEvent.create({ data });"))).toEqual(["x · standingEvent.create · data not an inline object literal"]);
    expect(one(fn("x", "await tx.standingEvent.create(args);"))).toEqual(["x · standingEvent.create · arguments not an inline object"]);
    expect(one(fn("x", "await tx.standingEvent.createMany({ data: { kind: \"SUSPEND\" } });"))).toEqual(["x · standingEvent.createMany SUSPEND · not a single create"]);
  });
  it("the writer creating another kind; another kind carrying a body or a withdrawal", () => {
    expect(one(fn("recordRegistrationCancelled", `await tx.standingEvent.create({ data: { kind: "SUSPEND" } });`))).toEqual(["recordRegistrationCancelled · standingEvent.create SUSPEND · the cancellation's writer creates another kind"]);
    expect(one(fn("suspendSupplier", `await tx.standingEvent.create({ data: { kind: "SUSPEND", externalReference: r } });`))).toEqual(["suspendSupplier · standingEvent.create SUSPEND · writes a cancellation's body or reference"]);
    expect(one(fn("recordRegistrationCancelled", `await tx.standingEvent.create({ data: { kind: "REGISTRATION_CANCELLED", withdrawnAt: now } });`))).toEqual(["recordRegistrationCancelled · standingEvent.create REGISTRATION_CANCELLED · creates an event withdrawn"]);
  });
  it("an update outside the withdrawal, the withdrawal writing more, a delete, a handle taken", () => {
    expect(one(fn("x", "await tx.standingEvent.updateMany({ where: { id }, data: { effectiveOn: d } });"))).toEqual(["x · standingEvent.updateMany · a standing event updated outside the withdrawal"]);
    expect(one(fn("withdrawRegistrationCancelled", "await tx.standingEvent.updateMany({ where: { id }, data: { withdrawnAt: n, withdrawnReason: r, withdrawnByPersonId: p, effectiveOn: d } });"))).toEqual(["withdrawRegistrationCancelled · standingEvent.updateMany · the withdrawal writes more than its three columns"]);
    expect(one(fn("withdrawRegistrationCancelled", "await tx.standingEvent.update({ where: { id }, data: { withdrawnAt: n } });"))).toEqual(["withdrawRegistrationCancelled · standingEvent.update · the withdrawal writes more than its three columns"]);
    expect(one(fn("x", "await tx.standingEvent.delete({ where: { id } });"))).toEqual(["x · standingEvent.delete · a standing event deleted"]);
    expect(one(fn("x", "const t = tx.standingEvent;\n  await t.create({ data: {} });"))).toEqual(["x · standingEvent handle · the model handle taken"]);
    expect(one(fn("x", `await tx["standingEvent"].create({ data: {} });`))).toEqual(["x · standingEvent by name · the model taken by name"]);
  });
  it("nothing in comments or strings", () => {
    expect(one(fn("x", `// tx.standingEvent.create({ data: { kind: "REGISTRATION_CANCELLED" } })\n  const s = "tx.standingEvent.updateMany(";`))).toEqual([]);
  });
});
