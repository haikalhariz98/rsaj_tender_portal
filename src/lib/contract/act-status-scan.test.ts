import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isServerModule, lex, rawCallText, rawCalls } from "@/lib/scan/source";

/**
 * Review S3 (6.13 Part B, Run 1a fix round): every way into a contract's records asks the act x status table. The scan
 * reads every "use server" file, and every other file that takes withLockedContract or withLockedCertificate (an owner
 * path such as the document store's). Its sites are each such lock, and each write (create, update, upsert, delete) to
 * a contract-owned model: Contract and every model with a required chain of relations to it, read from the schema.
 * A site is covered when its function asks actStatusFault, calls a function in its file that does, or is a helper whose
 * every caller in the file is covered. Anything else is a named exception, with its reason.
 *
 * Code re-review S-3 (residual round) closes four blind spots: (a) a server module is read however its directive is
 * written (isServerModule, shared with lock-order.test.ts); (b) createManyAndReturn and updateManyAndReturn are writes,
 * and so is raw SQL (rawCalls) that inserts into, updates or deletes from a contract-owned table, or that the scan cannot
 * read; (c) a call to an exported writer in src/lib/** (a function that writes a contract-owned model, itself or through
 * the writers it calls) is a site; (d) a committee's outcome on a variation's matter asks VARIATION's row.
 */

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

/// Contract and every model whose required relations lead to it (a nullable link, such as a route's, does not own).
function contractOwnedModels(schema: string): Set<string> {
  const models = new Map([...schema.matchAll(/\nmodel (\w+) \{([\s\S]*?)\n\}/g)].map((m) => [m[1], m[2]]));
  const rel = new Map([...models].map(([m, body]) => [m, new Set([...body.matchAll(/^\s+\w+\s+(\w+)\s+@relation\([^)]*fields:/gm)].map((x) => x[1]))]));
  const owned = new Set(["Contract"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [m, targets] of rel) {
      if (owned.has(m) || ![...targets].some((t) => owned.has(t))) continue;
      owned.add(m);
      grew = true;
    }
  }
  return owned;
}

type Site = { file: string; fn: string; site: string };

const WRITE_OPS = "create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany";
const heads = (src: string) => [...src.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)].map((m) => ({ at: m.index, name: m[1] }));

/// Every write in a source to a contract-owned model, by position: a Prisma delegate write (S-3b: the AndReturn forms
/// too), and raw SQL that inserts into, updates or deletes from an owned table, or that the scan cannot read (S-3b).
function ownedWrites(src: string, owned: Set<string>): { at: number; site: string }[] {
  const delegates = new Set([...owned].map((m) => m[0].toLowerCase() + m.slice(1)));
  const out: { at: number; site: string }[] = [];
  for (const m of src.matchAll(new RegExp(`\\b(?:tx|db|client)\\.(\\w+)\\.(?:${WRITE_OPS})\\(`, "g"))) if (delegates.has(m[1])) out.push({ at: m.index, site: m[0] });
  const lexed = lex(src);
  const table = new RegExp(`\\b(?:UPDATE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+"?(${[...owned].join("|")})"?(?:\\s|\\(|$)`, "i");
  for (const c of rawCalls(lexed)) {
    const sql = c.unsafe ? null : rawCallText(src, lexed, c);
    const name = `$${c.method}${c.suffix}`;
    if (sql == null) out.push({ at: c.at, site: `${name} (raw SQL the scan cannot read)` });
    else if (table.test(sql)) out.push({ at: c.at, site: `${name} writes "${table.exec(sql)![1]}"` });
  }
  return out;
}

/// A file's named imports: local name to the module specifier's file among the given ones (or null).
function importsOf(file: string, src: string, known: ReadonlySet<string>): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
    const spec = m[2];
    const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? join(file, "..", spec) : null;
    const target = base ? ([".ts", ".tsx", "/index.ts"].map((e) => base + e).find((p) => known.has(p)) ?? null) : null;
    for (const part of m[1].split(",")) {
      const names = part.replace(/^\s*type\s+/, "").trim().split(/\s+as\s+/);
      if (names[0]) out.set((names[1] ?? names[0]).trim(), target ? `${target}#${names[0].trim()}` : null);
    }
  }
  return out;
}

/// S-3c: the exported writers of src/lib/**: each exported function that writes a contract-owned model, itself, through a
/// local helper, or through another writer it imports (to a fixpoint across files), as file#name.
function contractWriters(lib: ReadonlyMap<string, string>, owned: Set<string>, opts: { local?: boolean } = {}): Set<string> {
  const known = new Set(lib.keys());
  const fns = [...lib].flatMap(([file, src]) => {
    const hs = heads(src);
    const imports = importsOf(file, src, known);
    const exported = new Set([...src.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]));
    const writes = ownedWrites(src, owned);
    return hs.map((h, i) => {
      const end = hs[i + 1]?.at ?? src.length;
      return { file, name: h.name, key: `${file}#${h.name}`, exported: exported.has(h.name), body: src.slice(h.at, end), direct: writes.some((w) => w.at >= h.at && w.at < end), imports, locals: new Set(hs.map((x) => x.name)) };
    });
  });
  const writing = new Set(fns.filter((f) => f.direct).map((f) => f.key));
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of fns) {
      if (writing.has(f.key)) continue;
      const called = [...f.body.slice(f.body.indexOf("(")).matchAll(/(?<![.\w])(\w+)\(/g)].map((m) => m[1]).filter((n) => n !== f.name);
      const hit = called.some((n) => (f.locals.has(n) ? writing.has(`${f.file}#${n}`) : writing.has(f.imports.get(n) ?? "")));
      if (!hit) continue;
      writing.add(f.key);
      grew = true;
    }
  }
  return new Set(fns.filter((f) => (opts.local || f.exported) && writing.has(f.key)).map((f) => f.key));
}

/// The uncovered sites of one file's source. `writers` (S-3c): the exported writers of src/lib/**, as file#name.
function uncoveredSites(file: string, src: string, owned: Set<string>, writers: ReadonlySet<string> = new Set(), known: ReadonlySet<string> = new Set()): Site[] {
  const heads_ = heads(src);
  const bodies = new Map(heads_.map((h, i) => [h.name, src.slice(h.at, heads_[i + 1]?.at ?? src.length)]));
  const exported = new Set([...src.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]));
  const calls = (body: string, name: string) => new RegExp(`\\b${name}\\(`).test(body);
  const covered = new Set([...bodies].filter(([, b]) => b.includes("actStatusFault(")).map(([n]) => n));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [n, b] of bodies) {
      if (covered.has(n)) continue;
      const callsGated = [...covered].some((g) => g !== n && calls(b, g));
      const callers = [...bodies].filter(([m, mb]) => m !== n && calls(mb.slice(mb.indexOf("{")), n)).map(([m]) => m);
      const onlyCoveredCallers = !exported.has(n) && callers.length > 0 && callers.every((m) => covered.has(m));
      if (!callsGated && !onlyCoveredCallers) continue;
      covered.add(n);
      grew = true;
    }
  }
  const sites = [...src.matchAll(/withLocked(?:Contract|Certificate)\(/g)].map((m) => ({ at: m.index, site: m[0] }));
  sites.push(...ownedWrites(src, owned));
  // S-3c: a call to an imported writer of src/lib/**.
  const imports = importsOf(file, src, known);
  for (const m of src.matchAll(/(?<![.\w])(\w+)\(/g)) if (writers.has(imports.get(m[1]) ?? "")) sites.push({ at: m.index, site: `${m[1]}( (a writer of ${imports.get(m[1])!.split("#")[0]})` });
  const out: Site[] = [];
  for (const x of sites.sort((a, b) => a.at - b.at)) {
    const fn = heads_.filter((h) => h.at <= x.at).at(-1)?.name ?? "(top)";
    if (!covered.has(fn)) out.push({ file, fn, site: x.site });
  }
  return out;
}

/// The sites that do not ask the table themselves, each with why.
const EXCEPTIONS: Readonly<Record<string, string>> = {
  "src/app/awards/actions.ts#issueAward": "The instrument's issue creates the contract (and its case's ownership event): there is no contract state yet for the table to read.",
  "src/app/awards/actions.ts#cancelAward": "The award's cancellation cancels its contract before execution (6.11 BD-17): an act on the award judged by contractCancellable, not an act on the contract (EDGE_EXCEPTIONS' AWARD_CANCELS).",
  "src/lib/certificate/repo.ts#withLockedCertificate": "The certificate's lock itself: its one caller, the certificate actions' inCertificate, asks the table for the certificate's kind and phase.",
  "src/lib/documents/owners.ts#withLockedOwner": "The document store's owner path for a contract and a variation's instruction: attachFault, detachFault and repinFault judge it through ownerState, which reads the owning family's ACT_STATUS row first (BD-613-115, contractTableState).",
};

const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");
const OWNED = contractOwnedModels(SCHEMA);
const ALL = new Map(walk("src").filter((f) => /\.tsx?$/.test(f) && !f.includes(".test.") && !f.includes("/generated/")).map((f) => [f, readFileSync(f, "utf8")]));
const KNOWN = new Set(ALL.keys());
// S-3a: a server module however its directive is written (isServerModule, as lock-order.test.ts reads them).
const FILES = [...ALL].filter(([, s]) => isServerModule(s) || /withLocked(?:Contract|Certificate)\(/.test(s)).map(([f]) => f);
const WRITERS = contractWriters(new Map([...ALL].filter(([f]) => f.startsWith("src/lib/") && f.endsWith(".ts"))), OWNED);
const sitesOf = (f: string) => uncoveredSites(f, ALL.get(f)!, OWNED, WRITERS, KNOWN);

/// S-3d: a committee's outcome on a variation's matter is a variation act. recordOutcome routes such a matter through a
/// wrapper that takes the contract's lock, asks VARIATION's row, and only then locks the variation and the sitting (the
/// order tableVariationMatter takes); under the locks the matter must still be that variation's. Each fault, in words.
function outcomeGateFaults(src: string): string[] {
  const fnBody = (name: string) => {
    const at = src.search(new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, "m"));
    return at < 0 ? null : src.slice(at, src.indexOf("\n}\n", at));
  };
  const out: string[] = [];
  const outcome = fnBody("recordOutcome");
  const wrap = fnBody("inSittingAfterContract");
  if (!outcome) return ["no recordOutcome"];
  if (!/\bvariation \? inSittingAfterContract\(meetingId, variation, run\)/.test(outcome)) out.push("recordOutcome does not route a variation's matter through inSittingAfterContract");
  if (!/decision\.variationId !== \(variation\?\.id \?\? null\)/.test(outcome)) out.push("recordOutcome does not check, under the locks, that the matter is still the variation's");
  if (!wrap) return [...out, "no inSittingAfterContract"];
  const gate = wrap.indexOf('actStatusFault("VARIATION", l.contract.status as ContractStatus)');
  const locked = wrap.indexOf("withLockedContract(");
  const sitting = wrap.indexOf("lockSittingIn(");
  if (locked < 0) out.push("the wrapper does not take the contract's lock");
  if (gate < 0) out.push("the wrapper does not ask VARIATION's row");
  if (gate >= 0 && (gate < locked || (sitting >= 0 && sitting < gate))) out.push("the wrapper asks the row outside the contract's lock, or after the sitting's");
  return out;
}

describe("S3: the scan finds what it should (self-test)", () => {
  it("S-3d: the outcome check fails an ungated outcome, a gate taken after the sitting's lock, and a missing re-check; passes the gated form", () => {
    const wrap = (inner: string) => `async function inSittingAfterContract(meetingId, variation, fn) {\n  return withLockedContract(variation.contractId, async (tx, l) => {\n${inner}\n  });\n}\n`;
    const good = 'export async function recordOutcome(p, d) {\n  const run = async (tx, s) => { if (decision.variationId !== (variation?.id ?? null)) return x; };\n  return exerciseId ? a() : variation ? inSittingAfterContract(meetingId, variation, run) : inSitting(meetingId, run);\n}\n' + wrap('    const refused = actStatusFault("VARIATION", l.contract.status as ContractStatus);\n    const s = await lockSittingIn(tx, meetingId, roster);');
    expect(outcomeGateFaults(good)).toEqual([]);
    expect(outcomeGateFaults("export async function recordOutcome(p, d) {\n  return inSitting(meetingId, run);\n}\n")).toEqual(["recordOutcome does not route a variation's matter through inSittingAfterContract", "recordOutcome does not check, under the locks, that the matter is still the variation's", "no inSittingAfterContract"]);
    const late = good.replace(wrap('    const refused = actStatusFault("VARIATION", l.contract.status as ContractStatus);\n    const s = await lockSittingIn(tx, meetingId, roster);'), wrap('    const s = await lockSittingIn(tx, meetingId, roster);\n    const refused = actStatusFault("VARIATION", l.contract.status as ContractStatus);'));
    expect(outcomeGateFaults(late)).toEqual(["the wrapper asks the row outside the contract's lock, or after the sitting's"]);
  });

  it("the owned models: the contract's records, its certificates, variations and securities; not a route or an evaluation", () => {
    for (const m of ["Contract", "Certificate", "Variation", "VariationInstruction", "SecurityInstrument", "InsurancePolicy", "InterimValuation", "SiteDiaryEntry", "ContractMatter", "CustodyMovement"]) expect(OWNED.has(m), m).toBe(true);
    for (const m of ["ApprovalInstance", "Evaluation", "Exercise", "Award", "Supplier", "DocumentAttachment"]) expect(OWNED.has(m), m).toBe(false);
  });

  it("an ungated write, an ungated lock and a helper called from an ungated act are found; a gated wrapper, its acts and their helpers are not", () => {
    const src = [
      "async function inContract(id, act, fn) { return withLockedContract(id, async (tx, l) => { const refused = actStatusFault(act, l.contract.status); return fn(tx); }); }",
      'export async function gatedAct(d) { return inContract(d, "VALUATION", async (tx) => { await tx.interimValuation.create({}); await helper(tx); }); }',
      "async function helper(tx) { await tx.contract.updateMany({}); }",
      "export async function ungated(d) { await withLockedContract(d, async (tx) => { await tx.securityInstrument.create({}); await other(tx); }); }",
      "async function other(tx) { await tx.insurancePolicy.update({}); }",
      "export async function notOwned(d) { await db.evaluation.update({}); }",
    ].join("\n");
    expect(uncoveredSites("x.ts", src, OWNED).map((s) => `${s.fn}: ${s.site}`)).toEqual(["ungated: withLockedContract(", "ungated: tx.securityInstrument.create(", "other: tx.insurancePolicy.update("]);
  });

  it("S-3a: a server module however its directive is written (single quotes, after a comment) is read", () => {
    for (const src of ["'use server';\nexport async function a() {}", "// actions\n\"use server\";\n", "/** doc */\n'use server'\n"]) expect(isServerModule(src), src).toBe(true);
    expect(isServerModule('import x from "y";\n"use server";')).toBe(false);
    for (const [f, s] of ALL) if (/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*['"]use server['"]/.test(s)) expect(FILES, f).toContain(f);
  });

  it("S-3b: createManyAndReturn, updateManyAndReturn, and raw SQL writing an owned table (or unreadable) are sites; raw SQL that only reads or locks is not", () => {
    // A template's interpolation, written so the source is not itself a template (no-template-curly-in-string).
    const D = "$" + "{d}";
    const src = [
      "export async function a(d) { await tx.securityInstrument.createManyAndReturn({}); }",
      "export async function b(d) { await db.insurancePolicy.updateManyAndReturn({}); }",
      `export async function c(d) { await tx.$executeRaw\`UPDATE "Contract" SET status = ${D}\`; }`,
      `export async function e(d) { await tx.$executeRaw<number>\`INSERT INTO "SecurityInstrument" (id) VALUES (${D})\`; }`,
      "export async function g(d) { await tx.$executeRawUnsafe(sql); }",
      `export async function h(d) { await tx.$queryRaw\`SELECT id FROM "Contract" WHERE id = ${D} FOR UPDATE\`; await tx.$executeRaw\`UPDATE "Evaluation" SET x = 1\`; }`,
    ].join("\n");
    expect(uncoveredSites("x.ts", src, OWNED).map((s) => `${s.fn}: ${s.site}`)).toEqual([
      "a: tx.securityInstrument.createManyAndReturn(",
      "b: db.insurancePolicy.updateManyAndReturn(",
      'c: $executeRaw writes "Contract"',
      'e: $executeRaw writes "SecurityInstrument"',
      "g: $executeRawUnsafe (raw SQL the scan cannot read)",
    ]);
  });

  it("S-3c: an exported writer is found through local helpers and other writers, and a call to one from an act is a site unless gated", () => {
    const lib = new Map([
      ["src/lib/w/write.ts", 'import { deep } from "./deep";\nexport async function direct(tx) { await tx.certificate.update({}); }\nexport async function viaLocal(tx) { await helper(tx); }\nasync function helper(tx) { await tx.variation.create({}); }\nexport async function viaOther(tx) { await deep(tx); }\nexport async function reads(tx) { await tx.certificate.findMany({}); }\n'],
      ["src/lib/w/deep.ts", "export async function deep(tx) { await tx.$executeRaw`DELETE FROM \"Variation\" WHERE 1 = 1`; }\n"],
    ]);
    const writers = contractWriters(lib, OWNED);
    expect([...writers].sort()).toEqual(["src/lib/w/deep.ts#deep", "src/lib/w/write.ts#direct", "src/lib/w/write.ts#viaLocal", "src/lib/w/write.ts#viaOther"]);
    const act = [
      'import { direct, reads, viaOther } from "@/lib/w/write";',
      "async function inContract(id, act, fn) { return withLockedContract(id, async (tx, l) => { const refused = actStatusFault(act, l.contract.status); return fn(tx); }); }",
      'export async function gated(d) { return inContract(d, "VARIATION", async (tx) => { await direct(tx); }); }',
      "export async function ungated(d) { await db.$transaction(async (tx) => { await viaOther(tx); await reads(tx); x.direct(tx); }); }",
    ].join("\n");
    expect(uncoveredSites("src/app/x/actions.ts", act, OWNED, writers, new Set(lib.keys())).map((s) => `${s.fn}: ${s.site}`)).toEqual(["ungated: viaOther( (a writer of src/lib/w/write.ts)"]);
  });

  it("S-3c: the writers the re-review named are found: exported, or local and called by an exported writer of their file", () => {
    const local = contractWriters(new Map([...ALL].filter(([f]) => f.startsWith("src/lib/") && f.endsWith(".ts"))), OWNED, { local: true });
    const named = {
      "src/lib/certificate/write.ts": ["moveTo", "openCertificate", "issue"],
      "src/lib/payment/finance-write.ts": ["recordFinancePayment"],
      "src/lib/variation/route-write.ts": ["sendVariationRoute", "openApplication", "sendRefused"],
      "src/lib/variation/at-certificate.ts": ["afterCertificateIssue"],
    };
    for (const [file, names] of Object.entries(named)) {
      const src = ALL.get(file)!;
      const hs = heads(src);
      for (const n of names) {
        expect(local.has(`${file}#${n}`), `${file}#${n} writes`).toBe(true);
        if (WRITERS.has(`${file}#${n}`)) continue;
        const callersOf = (x: string) => hs.filter((h, i) => h.name !== x && new RegExp(`(?<![.\\w])${x}\\(`).test(src.slice(h.at, hs[i + 1]?.at ?? src.length))).map((h) => h.name);
        const seen = new Set([n]);
        for (const q = [n]; q.length; )
          for (const c of callersOf(q.shift()!))
            if (!seen.has(c)) {
              seen.add(c);
              q.push(c);
            }
        expect([...seen].some((c) => WRITERS.has(`${file}#${c}`)), `${file}#${n}: an exported writer reaches it (${[...seen].join(", ")})`).toBe(true);
      }
    }
  });

  it("it reads every \"use server\" file and the owner paths that take the lock", () => {
    expect(FILES.length).toBeGreaterThan(40);
    for (const f of ["src/app/awards/actions.ts", "src/app/documents/actions.ts", "src/app/approvals/actions.ts", "src/app/committees/actions.ts", "src/lib/documents/owners.ts", "src/lib/certificate/repo.ts", "src/app/projects/[id]/payment-actions.ts"]) expect(FILES, f).toContain(f);
  });
});

describe("S3: every way into a contract's records asks the table, or is named with its reason", () => {
  it("no uncovered site outside the named exceptions", () => {
    const found = FILES.flatMap(sitesOf);
    expect([...new Set(found.filter((s) => !EXCEPTIONS[`${s.file}#${s.fn}`]).map((s) => `${s.file}#${s.fn}: ${s.site}`))]).toEqual([]);
  });

  it("every named exception is still a site (none is stale)", () => {
    const found = new Set(FILES.flatMap(sitesOf).map((s) => `${s.file}#${s.fn}`));
    for (const k of Object.keys(EXCEPTIONS)) expect(found.has(k), k).toBe(true);
  });

  it("the award's securities register asks FORMATION's row, on the act and on the award's screen", () => {
    const acts = readFileSync("src/app/awards/actions.ts", "utf8");
    expect(acts).toMatch(/function registerRefusal\(l: LoadedAward\): string \| null \{[\s\S]*?actStatusFault\("FORMATION", c\.status as ContractStatus\)/);
    for (const a of ["lodgeSecurity", "reviewSecurity", "lodgePolicy", "reviewPolicy"]) {
      const body = acts.slice(acts.indexOf(`export async function ${a}(`), acts.indexOf("\n}\n", acts.indexOf(`export async function ${a}(`)));
      expect(body, a).toMatch(/registerRefusal\(l\)/);
    }
    const page = readFileSync("src/app/awards/[id]/page.tsx", "utf8");
    expect(page).toMatch(/const open = !!c && !actStatusFault\("FORMATION", c\.status as ContractStatus\);/);
  });

  it("S-3d: a committee's outcome on a variation's matter asks VARIATION's row under the contract's lock (committees/actions.ts)", () => {
    expect(outcomeGateFaults(ALL.get("src/app/committees/actions.ts")!)).toEqual([]);
  });

  it("the document store's owner path reads the table through ownerState (source)", () => {
    const attach = readFileSync("src/lib/documents/attach.ts", "utf8");
    expect(attach).toMatch(/function contractTableState\([\s\S]*?actStatusFault\(act, status\)/);
    expect(attach).toMatch(/case "contract":\n\s+return contractTableState\(purpose, owner\.status\) \?\? contractOwnerState\(purpose, owner\);/);
    expect(attach).toMatch(/case "variationInstruction": \{[\s\S]*?contractTableState\(purpose, owner\.contractStatus\)/);
  });
});
