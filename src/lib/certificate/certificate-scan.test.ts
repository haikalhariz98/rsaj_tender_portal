import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { enclosingFn, lex, spans } from "@/lib/scan/source";

import { BOUND_FIELDS } from "./fields";

/**
 * Source scans for the certificate core (6.14 increment 1), extending 6.12's lock-order and single-writer
 * scans to certificates:
 * - one lock order: every certificate act runs inside `inCertificate` → `withLockedCertificate` →
 *   `withLockedContract`, reads the clock once on entry, and locks only a domain row (a copy) after the
 *   certificate, never a parent and never the supplier;
 * - single writers: the certificate's date only from a signature and its audited correction; ISSUED, the
 *   number and the sequence only from the issue; a certificate's rows only from the core's helpers (and the
 *   demo's own named loader and wipe);
 * - FR-CRT-002: no act posts a bound field.
 * The source is lexed first (strings, comments, regular expressions and template text blanked), and each
 * write is credited to its true enclosing function.
 */

const ROOT = path.join(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const ACTIONS = "src/app/projects/[id]/certificates/[certId]/actions.ts";
const WRITE = "src/lib/certificate/write.ts";
const REPO = "src/lib/certificate/repo.ts";

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}

const SOURCES = [...files("src/app"), ...files("src/lib"), ...files("prisma")].map((file) => ({ file, src: read(file) }));

/// Each exported action's body, by name.
function actions(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of src.split(/\nexport async function /).slice(1)) out.set(p.slice(0, p.indexOf("(")), p.split(/\n(?:async )?function /)[0]);
  return out;
}

/// Every write on the given models, credited to its enclosing function: "file › fn › model.op".
function writes(models: string[], ops = "update|updateMany|upsert|create|createMany|createManyAndReturn|delete|deleteMany"): { where: string; op: string; text: string }[] {
  const out: { where: string; op: string; text: string }[] = [];
  const re = new RegExp(`\\.\\s*(${models.join("|")})\\s*\\.\\s*(${ops})\\s*\\(`, "g");
  for (const { file, src } of SOURCES) {
    const m = lex(src);
    const sp = spans(m);
    for (const x of m.matchAll(re)) {
      // The call's argument text, to the matching bracket on the lexed source.
      let depth = 0;
      let e = x.index! + x[0].length - 1;
      for (; e < m.length; e++) {
        if (m[e] === "(") depth++;
        else if (m[e] === ")" && --depth === 0) break;
      }
      out.push({ where: `${file} › ${enclosingFn(sp, x.index!)}`, op: `${x[1]}.${x[2]}`, text: src.slice(x.index!, e + 1) });
    }
    // Raw SQL writing the tables.
    for (const x of m.matchAll(/\$(?:executeRaw|queryRaw)(?:Unsafe)?\s*[`(]/g)) {
      const s = src.slice(x.index!, src.indexOf("`", x.index! + x[0].length) + 1 || undefined);
      if (/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?(Certificate|CertificateSignature|CertificateOverride|CertificateDocument|RoutingCheck)"?/i.test(s)) out.push({ where: `${file} › ${enclosingFn(sp, x.index!)}`, op: "raw SQL", text: s });
    }
  }
  return out;
}

const P = (f: string) => path.normalize(f);
const DEMO = P("prisma/demo-certificates.ts");

describe("one lock order (withLockedCertificate)", () => {
  it("withLockedCertificate takes the contract's chain first, then the certificate", () => {
    const repo = read(REPO);
    const body = repo.slice(repo.indexOf("export async function withLockedCertificate"));
    expect(body.indexOf("withLockedContract(")).toBeGreaterThan(-1);
    expect(body.indexOf("withLockedContract(")).toBeLessThan(body.indexOf(`FROM "Certificate" WHERE id`));
  });

  it("every certificate act runs inside inCertificate, which is withLockedCertificate, and reads the clock once on entry", () => {
    const src = read(ACTIONS);
    const helper = src.slice(src.indexOf("async function inCertificate"), src.indexOf("const certOf"));
    expect(helper).toContain("withLockedCertificate(");
    expect(helper).not.toMatch(/new Date\(\)/);
    const acts = actions(src);
    expect(acts.size).toBeGreaterThanOrEqual(10);
    for (const [name, body] of acts) {
      expect(body, name).toMatch(/return inCertificate\(/);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(body.indexOf("inCertificate("));
      expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
    }
  });

  it("the helpers read no clock and lock only a copy (a domain row, after the certificate); never a parent, never the supplier, never outside the transaction", () => {
    const w = lex(read(WRITE));
    expect(w).not.toMatch(/new Date\(\)/);
    const src = read(WRITE);
    const locked = [...src.matchAll(/FROM "(\w+)" WHERE id = \$\{\w+\} FOR UPDATE/g)].map((m) => m[1]);
    expect(locked).toEqual(["IssuedCopy"]);
    expect(src).not.toMatch(/FROM "(Requisition|SourcingExercise|Award|Contract|Certificate|Supplier)" WHERE/);
    expect(w).not.toMatch(/\bdb\./);
  });
});

describe("single writers", () => {
  const CORE = ["certificate", "certificateSignature", "certificateOverride", "certificateDocument", "routingCheck"];

  it("a certificate's rows are written only by the core's helpers (and the demo's own loader and wipe)", () => {
    const where = [...new Set(writes(CORE).filter((x) => !x.where.startsWith(DEMO)).map((x) => x.where.split(" › ")[0]))].sort();
    // The pre-award routing sheet's checks are written by its own helper beside the core's.
    expect(where).toEqual([P(WRITE), P("src/lib/certificate/award-sheet.ts")].sort());
  });

  it("the certificate's date (FR-CRT-005): only the signature and its audited correction write it", () => {
    const by = writes(["certificate"], "update|updateMany|upsert|create|createMany").filter((x) => !x.where.startsWith(DEMO) && /\bcertificateDate\s*:/.test(x.text));
    expect([...new Set(by.map((x) => x.where))].sort()).toEqual([`${P(WRITE)} › correctCertificateDate`, `${P(WRITE)} › recordSignature`]);
    // No server action anywhere names it.
    for (const { file, src } of SOURCES) if (/^\s*["']use server["']/.test(src)) expect(lex(src), file).not.toMatch(/\bcertificateDate\s*:/);
  });

  it("ISSUED, the number and the sequence: only the issue writes them", () => {
    const src = read(WRITE);
    const m = lex(src);
    const sp = spans(m);
    const issued = [...src.matchAll(/moveTo\(c, "ISSUED"/g)].map((x) => enclosingFn(sp, x.index!));
    expect(issued).toEqual(["issue"]);
    const moves = [...src.matchAll(/moveTo\(c, "[A-Z_]+"/g)].map((x) => ({ fn: enclosingFn(sp, x.index!), text: src.slice(x.index!, src.indexOf(");", x.index!)) }));
    expect(moves.filter((x) => /\bnumber\b|\bsequence\b|issuedAt/.test(x.text)).map((x) => x.fn)).toEqual(["issue"]);
    // No direct write of the model names them either.
    expect(writes(["certificate"]).filter((x) => !x.where.startsWith(DEMO) && /\b(number|sequence|issuedAt)\s*:/.test(lex(x.text)))).toEqual([]);
  });

  it("the routing sheet's frozen type is written only when sent for routing", () => {
    const by = writes(["certificate"]).filter((x) => !x.where.startsWith(DEMO) && /\broutingSnapshot\b/.test(x.text));
    expect(by.map((x) => x.where)).toEqual([]);
    const src = read(WRITE);
    const sp = spans(lex(src));
    expect([...src.matchAll(/routingSnapshot: frozen/g)].map((x) => enclosingFn(sp, x.index!))).toEqual(["sendForRouting"]);
  });
});

describe("FR-CRT-002: no form posts a bound field", () => {
  const POSTED = /(?:r\.(?:text|date|int|money|choice|bool|optionalText|code)\(\s*|data\.get\(\s*)"([A-Za-z.]+)"/g;
  // The merge fields' keys, and the columns behind them a form could otherwise post.
  const BOUND_NAMES = new Set([...BOUND_FIELDS, "certificateDate", "number", "sequence", "computedSnapshot", "contractSum", "contractDate", "contractNumber", "contractorName", "issuedAt", "kind"]);
  it("the certificate acts read none of the certificate's bound fields", () => {
    const posted = [...read(ACTIONS).matchAll(POSTED)].map((m) => m[1]);
    expect(posted.length).toBeGreaterThan(10);
    expect(posted.filter((p) => BOUND_NAMES.has(p) || p.startsWith("figure"))).toEqual([]);
  });
  it("the drawers carry no input named for one either", () => {
    const editors = read("src/app/projects/[id]/certificates/[certId]/editors.tsx");
    const names = [...editors.matchAll(/name: "([A-Za-z.]+)"/g)].map((m) => m[1]);
    expect(names.filter((n) => BOUND_NAMES.has(n) || n.startsWith("figure"))).toEqual([]);
  });
});
