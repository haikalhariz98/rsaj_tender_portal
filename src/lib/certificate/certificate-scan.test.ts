import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { closing, enclosingFn, lex, spans } from "@/lib/scan/source";

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

const SOURCES = [...files("src/app"), ...files("src/components"), ...files("src/lib"), ...files("prisma")].map((file) => ({ file, src: read(file) }));

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
/// 6.13 Part A: the supervision demo opens a delegation's letter pair as drafts, as the delegation act does.
const DEMO_SUPERVISION = P("prisma/demo-supervision.ts");
/// 6.13 Part A step 3: the payment demo opens interim certificate 2 from its valuation and starts its routing sheet, as the acts do.
const DEMO_PAYMENT = P("prisma/demo-payment.ts");

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
    const where = [...new Set(writes(CORE).filter((x) => !x.where.startsWith(DEMO) && !x.where.startsWith(DEMO_SUPERVISION) && !x.where.startsWith(DEMO_PAYMENT)).map((x) => x.where.split(" › ")[0]))].sort();
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
    const by = writes(["certificate"]).filter((x) => !x.where.startsWith(DEMO) && !x.where.startsWith(DEMO_PAYMENT) && /\broutingSnapshot\b/.test(x.text));
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

// ------------------------------------------------------------------ 6.14 inc 1 fix R-8: the write scan, airtight
//
// The checks above credit a write to its file and find a protected key by a regular expression on the call's
// text. Here, as 6.12's re-review scan does for the contract, over every non-test source under src/app,
// src/components, src/lib and prisma: every Prisma 7 write op on a certificate-family model (however spaced,
// broken, optionally chained or called on a destructured handle) is credited to its true enclosing function and
// must be on a per-function allow-list, its data an inline literal whose keys the scan reads (quoted, shorthand
// or plain; a spread only where the helper is built on one; never a computed key; no nested write inside), each
// protected key with its own named writers. A model handle not followed directly by `.op(` (an alias, a
// bracketed op, a handle passed on or destructured) is flagged. Inside any Prisma write, every relation the
// schema types as a certificate-family model is read: a write key anywhere inside it, or a value the scan cannot
// read, is flagged. moveTo is called directly by name only, its status a literal from its one function and its
// patch judged per status. Raw SQL is read with comments blanked and strings kept, whole across lines: a write on
// a certificate table however quoted or schema-qualified (UPDATE, INSERT, DELETE, MERGE, TRUNCATE, COPY, ALTER,
// DROP), an interpolated table, Prisma.raw and any raw call with a non-template argument are flagged; in a file
// naming a certificate table as an SQL identifier, any raw call must be allow-listed by function and exact text.
// Limit (stated, not claimed away): a write on another model whose data is a variable is not seen into here.

const CERT_MODELS = ["certificate", "certificateSignature", "certificateOverride", "certificateDocument", "routingCheck", "awardRoutingSheet"];
const CERT_TABLES = ["Certificate", "CertificateSignature", "CertificateOverride", "CertificateDocument", "RoutingCheck", "AwardRoutingSheet"];
const AWARD_SHEET = "src/lib/certificate/award-sheet.ts";
const ROUTING_ACTIONS = "src/app/awards/[id]/routing-actions.ts";

/// The top-level comma-separated pieces of the bracketed text opening at `open` (lexed), as [from, to) offsets.
function pieces(m: string, open: number): [number, number][] {
  const close = closing(m, open);
  const out: [number, number][] = [];
  let depth = 0;
  let from = open + 1;
  for (let i = open + 1; i < close; i++) {
    if ("([{".includes(m[i])) depth++;
    else if (")]}".includes(m[i])) depth--;
    else if (m[i] === "," && depth === 0) {
      out.push([from, i]);
      from = i + 1;
    }
  }
  if (m.slice(from, close).trim()) out.push([from, close]);
  return out;
}

/// An object literal's keys as written (quoted, shorthand or plain), its spreads, and whether a key is computed.
function objectKeys(src: string, m: string, open: number): { keys: string[]; spreads: string[]; computed: boolean } {
  const out = { keys: [] as string[], spreads: [] as string[], computed: false };
  for (const [a, b] of pieces(m, open)) {
    const raw = src.slice(a, b).trim();
    const spread = /^\.\.\.([\s\S]*)$/.exec(raw);
    if (spread) {
      out.spreads.push(spread[1].replace(/\s+/g, ""));
      continue;
    }
    if (raw.startsWith("[")) {
      out.computed = true;
      continue;
    }
    const k = /^(["'`]?)([A-Za-z_$][\w$]*)\1\s*(?::|\(|$)/.exec(raw);
    if (k) out.keys.push(k[2]);
    else out.computed = true;
  }
  return out;
}

/// The value of property `key` in the object literal opening at `open`: its first character's offset, or null.
function propValue(src: string, m: string, open: number, key: string): number | "shorthand" | null {
  for (const [a, b] of pieces(m, open)) {
    const raw = src.slice(a, b);
    const k = new RegExp(`^\\s*(["']?)${key}\\1\\s*(:|$)`).exec(raw);
    if (!k) continue;
    if (k[2] !== ":") return "shorthand";
    let v = a + raw.indexOf(":", k[0].length - 1) + 1;
    while (/\s/.test(m[v])) v++;
    return v;
  }
  return null;
}

type CertAllow = Readonly<Record<string, { ops: readonly string[]; spread?: RegExp }>>;
const W_ = P(WRITE);
const AS = P(AWARD_SHEET);

/// Who may write each certificate model, by "file › function" and operation.
export const CERT_ALLOW: CertAllow = {
  [`${W_} › moveTo`]: { ops: ["certificate.updateMany"], spread: /^extra$/ },
  [`${W_} › openCertificate`]: { ops: ["certificate.create"] },
  [`${W_} › overrideField`]: { ops: ["certificateOverride.create"] },
  [`${W_} › recordRoutingReceived`]: { ops: ["certificate.updateMany"] },
  [`${W_} › recordCheck`]: { ops: ["routingCheck.create"] },
  [`${W_} › recordSignature`]: { ops: ["certificateSignature.create", "certificate.updateMany"] },
  [`${W_} › issue`]: { ops: ["certificateDocument.create"] },
  [`${W_} › correctCertificateDate`]: { ops: ["certificate.updateMany"] },
  [`${AS} › startAwardSheet`]: { ops: ["awardRoutingSheet.create"] },
  [`${AS} › recordAwardReceived`]: { ops: ["awardRoutingSheet.update"] },
  [`${AS} › recordAwardCheck`]: { ops: ["routingCheck.create"] },
};

/// A protected key of a certificate's row and the only functions that write it directly (in a model write's data).
const PROTECTED: Readonly<Record<string, readonly string[]>> = {
  status: [`${W_} › moveTo`],
  certificateDate: [`${W_} › recordSignature`, `${W_} › correctCertificateDate`],
  certificateDateCorrectedFrom: [`${W_} › correctCertificateDate`],
  certificateDateCorrectionReason: [`${W_} › correctCertificateDate`],
  number: [],
  sequence: [],
  issuedAt: [],
  issueSnapshot: [],
  routingSnapshot: [],
  templateRevision: [`${W_} › recordSignature`],
  pinnedAt: [`${W_} › recordSignature`],
  routingReceivedOn: [`${W_} › recordRoutingReceived`],
  routingReceivedRecordedAt: [`${W_} › recordRoutingReceived`],
  voidReason: [],
  voidedAt: [],
};

/// moveTo: the statuses each function may move to, and the patch keys each status may carry.
const MOVES: Readonly<Record<string, readonly string[]>> = { sendForRouting: ["IN_ROUTING"], proceedToSigning: ["SIGNING"], issue: ["ISSUED"], voidCertificate: ["VOID"] };
const MOVE_PATCH: Readonly<Record<string, readonly string[]>> = { IN_ROUTING: ["routingSnapshot"], SIGNING: [], ISSUED: ["number", "sequence", "issuedAt", "issueSnapshot"], VOID: ["voidReason", "voidedAt"] };

interface CertWrite {
  where: string;
  op: string;
  problem: string | null;
}

/// Every Prisma 7 operation on a model delegate: the writes, and the reads a handle may be followed by.
const WRITE_OPS = ["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"];
const READ_OPS = ["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"];
/// A relation's write keys, at any depth inside a relation object.
const NESTED_WRITE = /\b(create|createMany|update|updateMany|upsert|delete|deleteMany|connectOrCreate|connect|disconnect|set)\s*:/;

/// Every relation field, on any model, whose type is a certificate-family model, read from the schema; and the
/// ones whose name another model also uses for a relation to something else (judged only under a family write).
function familyRelations(): { names: string[]; ambiguous: string[] } {
  const schema = read("prisma/schema.prisma");
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((x) => ({ name: x[1], body: x[2] }));
  const modelNames = new Set(models.map((x) => x.name));
  const fam = new Set<string>();
  const other = new Set<string>();
  for (const x of models)
    for (const line of x.body.split("\n")) {
      const t = /^\s+(\w+)\s+(\w+)/.exec(line);
      if (t && modelNames.has(t[2])) (CERT_TABLES.includes(t[2]) ? fam : other).add(t[1]);
    }
  return { names: [...fam].filter((n) => !other.has(n)).sort(), ambiguous: [...fam].filter((n) => other.has(n)).sort() };
}
const FAMILY = familyRelations();

/// Raw SQL allowed by "file › function" and its exact text: the certificate's lock, and a copy's lock after it.
const RAW_ALLOW: Readonly<Record<string, RegExp>> = {
  [`${P(REPO)} › withLockedCertificate`]: /^\$queryRaw`SELECT id FROM "Certificate" WHERE id = \$\{certificateId\} FOR UPDATE`$/,
  [`${W_} › onCopy`]: /^\$queryRaw`SELECT id FROM "IssuedCopy" WHERE id = \$\{copyId\} FOR UPDATE`$/,
  // 6.13 Part A step 3 (614-C4): escalating a certificate's route takes its chain's locks, in the one order (each a lock, never a write).
  // 6.13 Part A step 4 (614-C4, the allow-list extended as designed): and a variation's route, Contract then Variation.
  // 6.14 increment 2 fix (code review M-3): the documents register's Library, counted and paged in the database. Reads only:
  // each is exactly this text over the \`entries\` fragment (whose SQL the write scan reads with the rest of the file).
  [`${P("src/lib/certificate/register.ts")} › libraryCount`]: /^\$queryRaw<\{ n: number \}\[\]>`WITH entries AS \(\$\{list\}\) SELECT count\(\*\)::int AS n FROM entries`$/,
  [`${P("src/lib/certificate/register.ts")} › libraryEntries`]: /^\$queryRaw<Entry\[\]>`WITH entries AS \(\$\{list\}\) SELECT src, id, at FROM entries ORDER BY at DESC, id COLLATE "C" ASC LIMIT \$\{limit\} OFFSET \$\{offset\}`$/,
  // 6.14 increment 2 residual (consider): which issued certificates still say an alias being removed, matched by whole
  // words in the database so only their numbers are read. A read only: exactly this text.
  [`${P("src/lib/certificate/term-use.ts")} › aliasInUse`]: /^\$queryRaw<\{ number: string \| null; total: number \}\[\]>`SELECT x\."number", count\(\*\) OVER \(\)::int AS total FROM \(SELECT DISTINCT c\."id", c\."number" FROM "CertificateDocument" d JOIN "Certificate" c ON c\."id" = d\."certificateId" WHERE d\."organisationId" = \$\{organisationId\} AND c\."status" = 'ISSUED' AND d\."renderedText" ~\* \$\{pattern\}\) x ORDER BY x\."number" COLLATE "C" ASC NULLS LAST, x\."id" COLLATE "C" ASC LIMIT \$\{ALIAS_USE_SHOWN\}`$/,
  [`${P("src/app/approvals/actions.ts")} › escalateStep`]: /^\$queryRaw`SELECT id FROM "(Requisition|SourcingExercise|Award|Contract|Certificate|Variation|Supplier|SupplierApplication|StandingRequest|SpecialPermission)" WHERE id = \$\{[\w.]+\} FOR UPDATE`$/,
};
const TABLE_ALT = CERT_TABLES.join("|");
const WRITE_SQL = new RegExp(`\\b(UPDATE|INSERT\\s+INTO|DELETE\\s+FROM|MERGE\\s+INTO|TRUNCATE(?:\\s+TABLE)?|COPY|ALTER\\s+TABLE|DROP\\s+TABLE)\\s+(?:ONLY\\s+)?(?:\\\\?["\`]?\\w+\\\\?["\`]?\\s*\\.\\s*)?\\\\?["'\`]?(${TABLE_ALT})\\\\?["'\`]?(?![\\w])`, "gi");
const SQL_VAR_TABLE = /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|MERGE\s+INTO)\s+(?:\w+\s*\.\s*)?\\?["'`]?\$\{/gi;
/// A certificate table named as an SQL identifier ("Certificate", double-quoted, as Postgres needs a mixed-case
/// name) inside a string or template: not a JS string whose text is the bare word (an audit entity, a label).
const SQL_IDENT = new RegExp(`\\\\?"(${TABLE_ALT})\\\\?"(?![\\w])`, "g");
const namesTableIn = (text: string, m: string) => [...text.matchAll(SQL_IDENT)].some((x) => m[x.index!] !== '"');

export function scanCertificateWrites(files: readonly { file: string; src: string }[], allow: CertAllow, demo = false): CertWrite[] {
  const out: CertWrite[] = [];
  const MODEL = CERT_MODELS.join("|");
  for (const { file, src } of files) {
    const m = lex(src);
    const sp = spans(m);
    const fnAt = (i: number) => enclosingFn(sp, i);
    const at = (i: number) => `${file} › ${fnAt(i)}`;
    const push = (i: number, op: string, problem: string | null) => out.push({ where: at(i), op, problem });

    // (1) A Prisma write on a certificate model, however spaced, broken across lines or optionally chained; the
    // handle may be any receiver or a bare (destructured) name.
    for (const x of m.matchAll(new RegExp(`(?<![\\w$])(${MODEL})\\s*\\??\\.\\s*(${WRITE_OPS.join("|")})\\s*\\(`, "g"))) {
      const op = `${x[1]}.${x[2]}`;
      const where = at(x.index!);
      if (demo) {
        push(x.index!, op, null);
        continue;
      }
      const r = allow[where];
      let problem: string | null = null;
      if (!r || !r.ops.includes(op)) problem = "not on the allow-list";
      const open = x.index! + x[0].length - 1;
      const args = pieces(m, open);
      const first = args[0] ? m.slice(args[0][0], args[0][1]).trim() : "";
      if (!problem && /^(delete|deleteMany)$/.test(x[2])) {
        // nothing written
      } else if (!problem && (args.length !== 1 || !first.startsWith("{"))) problem = "arguments not an inline object";
      else if (!problem) {
        const a0 = args[0][0] + m.slice(args[0][0]).search(/\{/);
        for (const k of x[2] === "upsert" ? ["create", "update"] : ["data"]) {
          const v = propValue(src, m, a0, k);
          if (v == null || v === "shorthand" || m[v] !== "{") {
            problem = `${k} not an inline object literal`;
            break;
          }
          const o = objectKeys(src, m, v);
          if (o.computed) problem = `${k} has a computed key`;
          else if (o.spreads.some((s) => !r!.spread?.test(s))) problem = `${k} has a spread`;
          else if (NESTED_WRITE.test(m.slice(v + 1, closing(m, v)))) problem = `${k} holds a nested write`;
          else {
            const bad = o.keys.filter((key) => PROTECTED[key] && !PROTECTED[key].includes(where));
            if (bad.length && x[1] === "certificate") problem = `writes ${bad.join(", ")}`;
          }
        }
      }
      push(x.index!, op, problem);
    }

    // (2) A model handle not followed directly by `.op(`: an alias, a bracketed operation, an optional chain to
    // something else, a handle passed on; and a handle destructured off a client.
    if (!demo) {
      for (const x of m.matchAll(new RegExp(`\\.\\s*(${MODEL})\\b`, "g"))) {
        const rest = m.slice(x.index! + x[0].length);
        const direct = new RegExp(`^\\s*\\??\\.\\s*(${[...WRITE_OPS, ...READ_OPS].join("|")})\\s*\\(`).test(rest);
        const property = /^\s*\??\.\s*[A-Za-z_$]/.test(rest) && !new RegExp(`^\\s*\\??\\.\\s*(${[...WRITE_OPS, ...READ_OPS].join("|")})\\b`).test(rest);
        if (!direct && !property && !HANDLE_EXEMPT[`${at(x.index!)} ${x[1]}`]) push(x.index!, `${x[1]} handle`, "the model handle taken");
      }
      for (const x of m.matchAll(new RegExp(`\\{[^{}]*(?<![\\w$.])(${MODEL})\\b[^{}]*\\}\\s*=(?![=>])`, "g"))) push(x.index!, `${x[1]} destructured`, "the model handle taken");
      for (const x of src.matchAll(new RegExp(`\\[\\s*["'\`](${MODEL}|${WRITE_OPS.join("|")})["'\`]\\s*\\]`, "g"))) if (m[x.index!] === "[") push(x.index!, `${x[1]} by name`, "the model taken by name");
    }

    // (3) A nested write through any relation to a certificate-family model, at any depth inside its object, or
    // a relation given a value the scan cannot read (a variable): inside the arguments of any Prisma write.
    for (const x of m.matchAll(new RegExp(`(?<![\\w$])(\\w+)\\s*\\??\\.\\s*(${WRITE_OPS.join("|")})\\s*\\(`, "g"))) {
      const open = x.index! + x[0].length - 1;
      const close = closing(m, open);
      const names = CERT_MODELS.includes(x[1]) ? [...FAMILY.names, ...FAMILY.ambiguous] : FAMILY.names;
      const re = new RegExp(`(?<![\\w$.])(["']?)(${names.join("|")})\\1\\s*:`, "g");
      const seg = src.slice(open, close + 1);
      for (const k of seg.matchAll(re)) {
        const i = open + k.index!;
        if (k[1] ? m[i] !== k[1] : m[i] === " ") continue; // inside a string or comment (a quoted key keeps its quote in the lexed text)
        let v = i + k[0].length;
        while (/\s/.test(m[v])) v++;
        if (m[v] === "{") {
          const inner = m.slice(v + 1, closing(m, v));
          if (NESTED_WRITE.test(inner)) push(i, `nested ${k[2]}`, "a nested write");
        } else if (!/^(true|false)\b/.test(m.slice(v))) push(i, `nested ${k[2]}`, "nested data the scan cannot read");
      }
    }

    // (3) The certificate's status helper: its status a literal from its own mover, its patch an inline literal judged per status.
    if (file === W_ && !demo) {
      for (const x of m.matchAll(/\bmoveTo\s*\(/g)) {
        if (/function\s*$/.test(m.slice(Math.max(0, x.index! - 12), x.index!))) continue;
        const open = x.index! + x[0].length - 1;
        const args = pieces(m, open);
        const fn = fnAt(x.index!);
        const status = args[1] ? src.slice(args[1][0], args[1][1]).trim() : "";
        let problem: string | null = null;
        const lit = /^"([A-Z_]+)"$/.exec(status);
        if (!lit) problem = "status not a literal";
        else if (!(MOVES[fn] ?? []).includes(lit[1])) problem = `moves to ${lit[1]} from a function not listed for it`;
        if (args[2]) {
          let e = args[2][0];
          while (/\s/.test(m[e])) e++;
          if (m[e] !== "{") problem = "patch not an inline object literal";
          else {
            const o = objectKeys(src, m, e);
            if (o.computed || o.spreads.length) problem = "patch not an inline object literal";
            else {
              const extra = o.keys.filter((k) => !(lit ? (MOVE_PATCH[lit[1]] ?? []) : []).includes(k));
              if (extra.length && !problem) problem = `patch writes ${extra.join(", ")}`;
            }
          }
        }
        out.push({ where: `${file} › ${fn}`, op: `moveTo ${status}`, problem });
      }
    }

    // (3b) moveTo is called directly, by name, and never aliased, passed on, bound, called through .call or exported.
    if (!demo && file === W_)
      for (const x of m.matchAll(/\bmoveTo\b/g)) {
        const before = m.slice(0, x.index!).replace(/\s+$/, "");
        const after = m.slice(x.index! + "moveTo".length);
        const exported = /\bexport\s+(async\s+)?function\s*$/.test(before);
        const definition = /\bfunction\s*$/.test(before) && !exported;
        const direct = /^\s*\(/.test(after) && !before.endsWith(".") && !/\bfunction\s*$/.test(before);
        if (!definition && !direct) push(x.index!, "moveTo aliased", "moveTo not called directly");
      }

    // (4) Raw SQL. The text with comments blanked, read whole (a statement may span lines): a write on a
    // certificate table however qualified or quoted, a write whose table is interpolated, Prisma.raw anywhere;
    // and, in a file that names a certificate table, any raw call not allow-listed by its function and text.
    const text = lex(src, { only: "comments" });
    for (const w of text.matchAll(WRITE_SQL)) push(w.index!, "raw SQL", "raw SQL writes a certificate table");
    for (const w of text.matchAll(SQL_VAR_TABLE)) push(w.index!, "raw SQL", "raw SQL with an interpolated table");
    for (const x of m.matchAll(/\bPrisma\s*\.\s*raw\s*\(/g)) push(x.index!, "Prisma.raw", "raw SQL the scan cannot read");
    const namesTable = namesTableIn(text, m);
    // 6.14 inc 2 fix (stricter): a raw call with a type argument (`$queryRaw<T>\`…\``) is read too, never skipped.
    // Residual consider: a nested type argument (`$queryRaw<Array<Entry>>\`…\``) too: the argument runs up to the backtick or parenthesis.
    for (const x of m.matchAll(/\$(executeRaw|queryRaw)(Unsafe)?\s*(?:<[^`(]*>)?\s*([`(])/g)) {
      if (x[3] === "(" || x[2]) {
        push(x.index!, `$${x[1]}${x[2] ?? ""}(…)`, "raw SQL the scan cannot read");
        continue;
      }
      if (!namesTable || demo) continue;
      const end = src.indexOf("`", x.index! + x[0].length);
      const call = src.slice(x.index!, end + 1);
      const rule = RAW_ALLOW[at(x.index!)];
      if (!rule || !rule.test(call)) push(x.index!, `$${x[1]}`, "raw SQL in a file naming a certificate table, not allow-listed");
    }
  }
  return out;
}

/// Model-handle-like property reads that are not a Prisma handle, by "file › function name" (none may write).
const HANDLE_EXEMPT: Readonly<Record<string, string>> = {
  "src/app/configuration/tender-documents/page.tsx › TenderDocumentsConfigurationPage certificate": "UNSET.certificate: a word map's entry, not a client",
};

describe("every write that can reach a certificate's rows (R-8)", () => {
  const product = SOURCES.filter((s) => !s.file.startsWith("prisma"));
  const demoSources = SOURCES.filter((s) => s.file.startsWith("prisma"));
  const found = scanCertificateWrites(product, CERT_ALLOW);

  it("the scan covers the acts, the helpers, the award's routing acts and the demo", () => {
    const names = SOURCES.map((s) => s.file);
    for (const f of [WRITE, REPO, ACTIONS, AWARD_SHEET, ROUTING_ACTIONS, "prisma/demo-certificates.ts"]) expect(names).toContain(P(f));
  });

  it("no product write is off the allow-list, written in a form the scan cannot read, or writes a protected key outside its writers", () => {
    expect(found.filter((w) => w.problem).map((w) => `${w.where} · ${w.op} · ${w.problem}`)).toEqual([]);
  });

  it("every allowed writer exists (the list cannot go stale)", () => {
    const seen = new Set(found.filter((w) => !w.op.startsWith("moveTo")).map((w) => `${w.where}|${w.op}`));
    for (const [where, r] of Object.entries(CERT_ALLOW)) for (const op of r.ops) expect(seen.has(`${where}|${op}`), `${where} ${op}`).toBe(true);
  });

  it("each status is moved to by its one function, and ISSUED only by the issue", () => {
    const moves = found.filter((w) => w.op.startsWith("moveTo")).map((w) => `${w.where.split(" › ")[1]} ${w.op}`).sort();
    expect(moves).toEqual(['issue moveTo "ISSUED"', 'proceedToSigning moveTo "SIGNING"', 'sendForRouting moveTo "IN_ROUTING"', 'voidCertificate moveTo "VOID"']);
  });

  it("the frozen routing type is written only by the move into routing, passed literally", () => {
    const w = read(WRITE);
    expect(w.match(/moveTo\(c, "IN_ROUTING", \{ routingSnapshot: frozen as unknown as Prisma\.InputJsonValue \}\)/g)).toHaveLength(1);
    expect(w.match(/\broutingSnapshot\b/g)!.length).toBe(1 + (w.match(/cert\.routingSnapshot|\.routingSnapshot\)/g) ?? []).length);
  });

  it("the demo (prisma/) writes a certificate's rows only in its own named loader and wipe, listed here", () => {
    expect([...new Set(scanCertificateWrites(demoSources, {}, true).filter((w) => !w.op.startsWith("moveTo") && w.op !== "raw SQL" && !w.op.startsWith("$")).map((w) => w.where))].sort()).toEqual(CERT_DEMO_WRITERS);
  });
});

/// The demo's certificate writers, named one by one: invented data loaded and wiped, never the product's acts.
const CERT_DEMO_WRITERS: string[] = ["prisma/demo-certificates.ts › check", "prisma/demo-certificates.ts › loadCertificatesDemo", "prisma/demo-certificates.ts › move", "prisma/demo-certificates.ts › open", "prisma/demo-certificates.ts › sign", "prisma/demo-certificates.ts › wipeAwardRoutingSheets", "prisma/demo-certificates.ts › wipeCertificates", "prisma/demo-payment.ts › loadPaymentDemo", "prisma/demo-payment.ts › wipePayments", "prisma/demo-supervision.ts › loadSupervisionDemo"].map(P);

describe("the pre-award sheet's acts keep the award's lock order (R-8)", () => {
  it("every act runs inside inAwardSheet, which is withLockedAward, and reads the clock once on entry", () => {
    const src = read(ROUTING_ACTIONS);
    const helper = src.slice(src.indexOf("async function inAwardSheet"), src.indexOf("const idOf"));
    expect(helper).toContain("withLockedAward(");
    expect(helper).not.toMatch(/new Date\(\)/);
    const acts = actions(src);
    expect(acts.size).toBe(3);
    for (const [name, body] of acts) {
      expect(body, name).toMatch(/return inAwardSheet\(/);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(body.indexOf("inAwardSheet("));
      expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
    }
  });
  it("the sheet's helpers read no clock, take no lock of their own and never write outside the act's transaction", () => {
    const m = lex(read(AWARD_SHEET));
    expect(m).not.toMatch(/new Date\(\)/);
    expect(read(AWARD_SHEET)).not.toMatch(/FOR UPDATE/);
    expect(m).not.toMatch(/\bdb\./);
    expect(read(AWARD_SHEET)).not.toMatch(/from "@\/lib\/db"/);
  });
  it("the certificate's own locks: only withLockedCertificate locks a certificate, and only after the contract's chain", () => {
    const lockers = SOURCES.filter((s) => !s.file.startsWith("prisma") && /FROM "Certificate" WHERE id = \$\{\w+\} FOR UPDATE/.test(s.src)).map((s) => s.file);
    expect(lockers).toEqual([P(REPO)]);
  });
});

describe("the write scan catches each evasion (self-tests)", () => {
  const one = (src: string, file = W_) => scanCertificateWrites([{ file, src }], CERT_ALLOW).filter((w) => w.problem).map((w) => `${w.where.split(" › ")[1]} · ${w.op} · ${w.problem}`);
  const fnHead = (name: string) => `export async function ${name}(c) {\n`;
  it("a write off the allow-list, and a write credited to its true enclosing function (an object method, a named arrow)", () => {
    expect(one(`${fnHead("acknowledgeCopy")}  await c.tx.certificate.updateMany({ where: { id }, data: { note: 1 } });\n}\n`)).toEqual(["acknowledgeCopy · certificate.updateMany · not on the allow-list"]);
    const src = `${fnHead("correctCertificateDate")}  await c.tx.certificate.updateMany({ where: { id }, data: { certificateDate: d } });\n}\nconst helpers = {\n  sneaky(tx) {\n    return tx.certificate.updateMany({ where: { id }, data: { certificateDate: d } });\n  },\n  quiet: async (tx) => tx.certificate.updateMany({ where: { id }, data: { certificateDate: d } }),\n};\n`;
    expect(one(src)).toEqual(["sneaky · certificate.updateMany · not on the allow-list", "quiet · certificate.updateMany · not on the allow-list"]);
    // A helper nested inside an allowed function is its own function, not the allowed one.
    expect(one(`${fnHead("correctCertificateDate")}  const inner = async () => c.tx.certificate.updateMany({ where: { id }, data: { certificateDate: d } });\n  await inner();\n}\n`)).toEqual(["inner · certificate.updateMany · not on the allow-list"]);
  });
  it("the data in a variable, a shorthand data, a spread or a computed key", () => {
    expect(one(`${fnHead("recordRoutingReceived")}  const data = { certificateDate: d };\n  await c.tx.certificate.updateMany({ where: { id }, data });\n}\n`)).toEqual(["recordRoutingReceived · certificate.updateMany · data not an inline object literal"]);
    expect(one(`${fnHead("recordRoutingReceived")}  await c.tx.certificate.updateMany({ where: { id }, data: patch });\n}\n`)).toEqual(["recordRoutingReceived · certificate.updateMany · data not an inline object literal"]);
    expect(one(`${fnHead("recordRoutingReceived")}  await c.tx.certificate.updateMany({ where: { id }, data: { ...patch } });\n}\n`)).toEqual(["recordRoutingReceived · certificate.updateMany · data has a spread"]);
    expect(one(`${fnHead("recordRoutingReceived")}  await c.tx.certificate.updateMany({ where: { id }, data: { [k]: d } });\n}\n`)).toEqual(["recordRoutingReceived · certificate.updateMany · data has a computed key"]);
    expect(one(`${fnHead("recordRoutingReceived")}  await c.tx.certificate.updateMany(args);\n}\n`)).toEqual(["recordRoutingReceived · certificate.updateMany · arguments not an inline object"]);
  });
  it("a protected key written plainly, quoted or in shorthand, outside its writers", () => {
    expect(one(`${fnHead("recordRoutingReceived")}  await c.tx.certificate.updateMany({ where: { id }, data: { certificateDate: d } });\n}\n`)).toEqual(["recordRoutingReceived · certificate.updateMany · writes certificateDate"]);
    expect(one(`${fnHead("recordRoutingReceived")}  await c.tx.certificate.updateMany({ where: { id }, data: { "certificateDate": d } });\n}\n`)).toEqual(["recordRoutingReceived · certificate.updateMany · writes certificateDate"]);
    expect(one(`${fnHead("recordRoutingReceived")}  await c.tx.certificate.updateMany({ where: { id }, data: { routingReceivedOn: x, number } });\n}\n`)).toEqual(["recordRoutingReceived · certificate.updateMany · writes number"]);
    expect(one(`${fnHead("openCertificate")}  await tx.certificate.create({ data: { 'sequence': 3, kind } });\n}\n`)).toEqual(["openCertificate · certificate.create · writes sequence"]);
  });
  it("a direct status write, ISSUED or any other, outside the status helper", () => {
    expect(one(`${fnHead("correctCertificateDate")}  await c.tx.certificate.updateMany({ where: { id, status: "SIGNING" }, data: { status: "ISSUED" } });\n}\n`)).toEqual(["correctCertificateDate · certificate.updateMany · writes status"]);
    expect(one(`${fnHead("correctCertificateDate")}  await c.tx.certificate.updateMany({ where: { id }, data: { status } });\n}\n`)).toEqual(["correctCertificateDate · certificate.updateMany · writes status"]);
  });
  it("moveTo with a status not a literal, from a function not listed for it, or with a patch the scan cannot read", () => {
    expect(one(`${fnHead("issue")}  await moveTo(c, to, { number });\n}\n`)).toEqual(["issue · moveTo to · status not a literal"]);
    expect(one(`${fnHead("correctCertificateDate")}  await moveTo(c, "ISSUED");\n}\n`)).toEqual(['correctCertificateDate · moveTo "ISSUED" · moves to ISSUED from a function not listed for it']);
    expect(one(`${fnHead("issue")}  await moveTo(c, "ISSUED", patch);\n}\n`)).toEqual(['issue · moveTo "ISSUED" · patch not an inline object literal']);
    expect(one(`${fnHead("issue")}  await moveTo(c, "ISSUED", { ...patch });\n}\n`)).toEqual(['issue · moveTo "ISSUED" · patch not an inline object literal']);
  });
  it("moveTo's patch is seen through: the frozen routing type only into routing, a date never", () => {
    expect(one(`${fnHead("voidCertificate")}  await moveTo(c, "VOID", { voidReason: r, routingSnapshot: t });\n}\n`)).toEqual(['voidCertificate · moveTo "VOID" · patch writes routingSnapshot']);
    expect(one(`${fnHead("issue")}  await moveTo(c, "ISSUED", { number, "certificateDate": d });\n}\n`)).toEqual(['issue · moveTo "ISSUED" · patch writes certificateDate']);
    expect(one(`${fnHead("sendForRouting")}  await moveTo(c, "IN_ROUTING", { routingSnapshot: frozen });\n}\n`)).toEqual([]);
  });
  it("a nested write through another model, or the model taken by name", () => {
    expect(one(`${fnHead("x")}  await tx.contract.update({ where: { id }, data: { certificates: { updateMany: { where: {}, data: { status: "ISSUED" } } } } });\n}\n`)).toEqual(["x · nested certificates · a nested write"]);
    expect(one(`${fnHead("x")}  await tx["certificate"].updateMany({ where: {}, data: {} });\n}\n`)).toEqual(["x · certificate by name · the model taken by name"]);
  });
  it("raw SQL however built: a tagged template, Prisma.sql, a string in a variable, an interpolated table, an unreadable call", () => {
    expect(one(`${fnHead("x")}  await tx.$executeRaw\`UPDATE "Certificate" SET status = 'ISSUED'\`;\n}\n`)).toEqual(["x · raw SQL · raw SQL writes a certificate table", "x · $executeRaw · raw SQL in a file naming a certificate table, not allow-listed"]);
    expect(one(`${fnHead("x")}  const q = Prisma.sql\`UPDATE "Certificate" SET "certificateDate" = NOW()\`;\n  await tx.$executeRaw(q);\n}\n`)).toEqual(["x · raw SQL · raw SQL writes a certificate table", "x · $executeRaw(…) · raw SQL the scan cannot read"]);
    expect(one(`${fnHead("x")}  const q = "DELETE FROM \\"RoutingCheck\\" WHERE 1 = 1";\n  await tx.$executeRawUnsafe(q);\n}\n`)).toEqual(["x · raw SQL · raw SQL writes a certificate table", "x · $executeRawUnsafe(…) · raw SQL the scan cannot read"]);
    expect(one(`${fnHead("x")}  await tx.$executeRawUnsafe(\`update "\${t}" set status = 'ISSUED'\`);\n}\n`)).toEqual(["x · raw SQL · raw SQL with an interpolated table", "x · $executeRawUnsafe(…) · raw SQL the scan cannot read"]);
    expect(one(`${fnHead("x")}  await tx.$executeRaw\`INSERT INTO "CertificateSignature" (id) VALUES (1)\`;\n}\n`)).toEqual(["x · raw SQL · raw SQL writes a certificate table", "x · $executeRaw · raw SQL in a file naming a certificate table, not allow-listed"]);
  });
  it("nothing is flagged in comments, strings naming a model, a where clause or a lock's SELECT … FOR UPDATE", () => {
    const src = `${fnHead("recordRoutingReceived")}  // tx.certificate.updateMany({ data: { certificateDate } })\n  // UPDATE "Certificate" SET x = 1\n  const s = "tx.certificate.updateMany(";\n  await c.tx.certificate.updateMany({ where: { id, status: "IN_ROUTING", certificateDate: null }, data: { routingReceivedOn: d, routingReceivedRecordedAt: c.now } });\n}\n`;
    expect(one(src)).toEqual([]);
    // The certificate's own lock, in the one function and with the one text allowed; the same lock anywhere else is flagged.
    const lock = `export async function withLockedCertificate(certificateId, fn) {\n  await tx.$queryRaw\`SELECT id FROM "Certificate" WHERE id = \${certificateId} FOR UPDATE\`;\n}\n`;
    expect(one(lock, P(REPO))).toEqual([]);
    expect(one(lock.replace("withLockedCertificate", "lockAgain"), P(REPO))).toEqual(["lockAgain · $queryRaw · raw SQL in a file naming a certificate table, not allow-listed"]);
  });
});

describe("the re-review's evasions are each caught (R-8 residual)", () => {
  const h = (n: string) => `export async function ${n}(c) {\n`;
  /// Each evasion, and the problem the scan must name for it.
  const CASES: Record<string, [string, RegExp]> = {
    updateManyAndReturn: [`${h("x")}  await c.tx.certificate.updateManyAndReturn({ where: { id }, data: { status: "ISSUED" } });\n}\n`, /certificate\.updateManyAndReturn · not on the allow-list/],
    alias: [`${h("x")}  const t = c.tx.certificate;\n  await t.updateMany({ where: { id }, data: { status: "ISSUED" } });\n}\n`, /certificate handle · the model handle taken/],
    destructure: [`${h("x")}  const { certificate } = c.tx;\n  await certificate.updateMany({ where: { id }, data: { status: "ISSUED" } });\n}\n`, /certificate destructured · the model handle taken/],
    optionalChain: [`${h("x")}  await c.tx.certificate?.updateMany({ where: { id }, data: { status: "ISSUED" } });\n}\n`, /certificate\.updateMany · not on the allow-list/],
    bracketOp: [`${h("x")}  await c.tx.certificate["updateMany"]({ where: { id }, data: { status: "ISSUED" } });\n}\n`, /certificate handle · the model handle taken/],
    nestedSecondKey: [`${h("x")}  await tx.contract.update({ where: { id }, data: { certificates: { disconnect: [], updateMany: { where: {}, data: { status: "ISSUED" } } } } });\n}\n`, /nested certificates · a nested write/],
    nestedVar: [`${h("x")}  await tx.contract.update({ where: { id }, data: { certificates: nested } });\n}\n`, /nested certificates · nested data the scan cannot read/],
    nestedOtherRel: [`${h("x")}  await tx.person.update({ where: { id }, data: { certificateSignatures: { create: { x: 1 } } } });\n}\n`, /nested certificateSignatures · a nested write/],
    nestedAwardSheets: [`${h("x")}  await tx.routingSheetType.update({ where: { id }, data: { awardSheets: { updateMany: { where: {}, data: { receivedOn: d } } } } });\n}\n`, /nested awardSheets · a nested write/],
    rawMultiline: [`${h("x")}  await tx.$executeRaw\`UPDATE\n    "Certificate" SET status = 'ISSUED'\`;\n}\n`, /raw SQL writes a certificate table/],
    rawSchema: [`${h("x")}  await tx.$executeRaw\`UPDATE public."Certificate" SET status = 'ISSUED'\`;\n}\n`, /raw SQL writes a certificate table/],
    rawPrismaRaw: [`${h("x")}  await tx.$executeRaw\`\${Prisma.raw(q)}\`;\n}\n`, /Prisma\.raw · raw SQL the scan cannot read/],
    rawConcat: [`${h("x")}  const q = Prisma.sql\`UPDATE \` ;\n  await tx.$executeRaw\`\${q} "Certificate" SET status = 'ISSUED'\`;\n}\n`, /\$executeRaw · raw SQL in a file naming a certificate table, not allow-listed/],
    moveAlias: [`${h("correctCertificateDate")}  const go = moveTo;\n  await go(c, "ISSUED", { number: "1" });\n}\n`, /moveTo aliased · moveTo not called directly/],
    moveCall: [`${h("correctCertificateDate")}  await moveTo.call(null, c, "ISSUED", { number: "1" });\n}\n`, /moveTo aliased · moveTo not called directly/],
    merge: [`${h("x")}  await tx.$executeRaw\`MERGE INTO "Certificate" c USING x ON true WHEN MATCHED THEN UPDATE SET status = 'ISSUED'\`;\n}\n`, /raw SQL writes a certificate table/],
  };
  it.each(Object.entries(CASES))("%s", (_name, [src, problem]) => {
    const found = scanCertificateWrites([{ file: W_, src }], CERT_ALLOW).filter((w) => w.problem).map((w) => `${w.op} · ${w.problem}`);
    expect(found.some((f) => problem.test(f)), found.join(" | ") || "nothing flagged").toBe(true);
  });
  it("6.14 inc 2 fix (stricter): a raw call with a type argument is read, not skipped", () => {
    const flags = (src: string) => scanCertificateWrites([{ file: W_, src }], CERT_ALLOW).filter((w) => w.problem).map((w) => w.problem);
    expect(flags(`${h("x")}  await c.tx.$queryRaw<{ id: string }[]>\`SELECT id FROM "Certificate"\`;\n}\n`)).toContain("raw SQL in a file naming a certificate table, not allow-listed");
  });
  it("6.14 inc 2 residual (stricter): a raw call with a nested type argument is read too, not skipped", () => {
    const flags = (src: string) => scanCertificateWrites([{ file: W_, src }], CERT_ALLOW).filter((w) => w.problem).map((w) => w.problem);
    expect(flags(`${h("x")}  await c.tx.$queryRaw<Array<Entry>>\`SELECT id FROM "Certificate"\`;\n}\n`)).toContain("raw SQL in a file naming a certificate table, not allow-listed");
    expect(flags(`${h("x")}  await c.tx.$queryRaw<Map<string, Array<{ id: string }>>>\`SELECT id FROM "Certificate"\`;\n}\n`)).toContain("raw SQL in a file naming a certificate table, not allow-listed");
    expect(flags(`${h("x")}  await c.tx.$queryRawUnsafe<Array<Entry>>(q);\n}\n`)).toContain("raw SQL the scan cannot read");
  });
  it("more of the same: the other write ops, a handle passed on, exported or bound moveTo, other relations, a quoted relation, TRUNCATE", () => {
    const flags = (src: string, file = W_) => scanCertificateWrites([{ file, src }], CERT_ALLOW).filter((w) => w.problem).map((w) => `${w.op} · ${w.problem}`);
    for (const op of ["createManyAndReturn", "upsert", "delete", "deleteMany", "createMany"]) expect(flags(`${h("x")}  await tx.routingCheck.${op}({ where: {} });\n}\n`).join("|"), op).toMatch(/not on the allow-list/);
    expect(flags(`${h("x")}  await helper(c.tx.certificateSignature);\n}\n`).join("|")).toMatch(/certificateSignature handle · the model handle taken/);
    expect(flags(`${h("x")}  const f = c.tx.awardRoutingSheet.update;\n  await f({ where: {}, data: {} });\n}\n`).join("|")).toMatch(/awardRoutingSheet handle · the model handle taken/);
    expect(flags("export async function moveTo(c, to) {\n  await c.tx.certificate.updateMany({ where: { id }, data: { status: to } });\n}\n").join("|")).toMatch(/moveTo not called directly/);
    expect(flags(`${h("issue")}  await moveTo.bind(null)(c, "ISSUED");\n}\n`).join("|")).toMatch(/moveTo not called directly/);
    expect(flags(`${h("x")}  await tx.organisation.update({ where: { id }, data: { "routingChecks": { deleteMany: {} } } });\n}\n`).join("|")).toMatch(/nested routingChecks · a nested write/);
    expect(flags(`${h("x")}  await tx.delegation.update({ where: { id }, data: { certificateSignatures: { set: [] } } });\n}\n`).join("|")).toMatch(/nested certificateSignatures · a nested write/);
    expect(flags(`${h("x")}  await tx.certificate.create({ data: { documents: { create: [] } } });\n}\n`).join("|")).toMatch(/a nested write|not on the allow-list/);
    expect(flags(`${h("x")}  await tx.$executeRaw\`TRUNCATE "RoutingCheck"\`;\n}\n`).join("|")).toMatch(/raw SQL writes a certificate table/);
    expect(flags(`${h("x")}  await tx.$executeRaw\`DELETE FROM "public"."AwardRoutingSheet"\`;\n}\n`).join("|")).toMatch(/raw SQL writes a certificate table/);
  });
  it("an award's own documents and a contract's own signatures are not a certificate's (the names other models also use)", () => {
    const flags = (src: string) => scanCertificateWrites([{ file: P("src/app/awards/actions.ts"), src }], CERT_ALLOW).filter((w) => w.problem);
    expect(flags(`${h("issueAward")}  await tx.award.update({ where: { id }, data: { documents: { create: [] }, signatures: { create: [] } } });\n}\n`)).toEqual([]);
    expect(FAMILY.ambiguous).toEqual(["documents", "signatures"]);
    for (const n of ["certificates", "certificateSignatures", "certificateOverrides", "certificateDocuments", "awardRoutingSheets", "awardSheets", "routingChecks", "routingSheet", "certificate", "overrides"]) expect(FAMILY.names, n).toContain(n);
  });
  it("the status helper is not exported", () => {
    expect(read(WRITE)).not.toMatch(/export\s+(async\s+)?function\s+moveTo\b|export\s*\{[^}]*\bmoveTo\b/);
  });
});
