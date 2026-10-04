import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Review S3 (6.13 Part B, Run 1a fix round): every way into a contract's records asks the act x status table. The scan
 * reads every "use server" file, and every other file that takes withLockedContract or withLockedCertificate (an owner
 * path such as the document store's). Its sites are each such lock, and each write (create, update, upsert, delete) to
 * a contract-owned model: Contract and every model with a required chain of relations to it, read from the schema.
 * A site is covered when its function asks actStatusFault, calls a function in its file that does, or is a helper whose
 * every caller in the file is covered. Anything else is a named exception, with its reason.
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

/// The uncovered sites of one file's source.
function uncoveredSites(file: string, src: string, owned: Set<string>): Site[] {
  const delegates = new Set([...owned].map((m) => m[0].toLowerCase() + m.slice(1)));
  const heads = [...src.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)].map((m) => ({ at: m.index, name: m[1] }));
  const bodies = new Map(heads.map((h, i) => [h.name, src.slice(h.at, heads[i + 1]?.at ?? src.length)]));
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
  const out: Site[] = [];
  for (const m of src.matchAll(/withLocked(?:Contract|Certificate)\(|\b(?:tx|db|client)\.(\w+)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)) {
    if (m[1] && !delegates.has(m[1])) continue;
    const fn = heads.filter((h) => h.at <= m.index).at(-1)?.name ?? "(top)";
    if (!covered.has(fn)) out.push({ file, fn, site: m[0] });
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
const FILES = walk("src").filter((f) => /\.tsx?$/.test(f) && !f.includes(".test.") && !f.includes("/generated/")).filter((f) => {
  const s = readFileSync(f, "utf8");
  return s.trimStart().startsWith('"use server"') || /withLocked(?:Contract|Certificate)\(/.test(s);
});

describe("S3: the scan finds what it should (self-test)", () => {
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

  it("it reads every \"use server\" file and the owner paths that take the lock", () => {
    expect(FILES.length).toBeGreaterThan(40);
    for (const f of ["src/app/awards/actions.ts", "src/app/documents/actions.ts", "src/app/approvals/actions.ts", "src/app/committees/actions.ts", "src/lib/documents/owners.ts", "src/lib/certificate/repo.ts", "src/app/projects/[id]/payment-actions.ts"]) expect(FILES, f).toContain(f);
  });
});

describe("S3: every way into a contract's records asks the table, or is named with its reason", () => {
  it("no uncovered site outside the named exceptions", () => {
    const found = FILES.flatMap((f) => uncoveredSites(f, readFileSync(f, "utf8"), OWNED)).map((s) => `${s.file}#${s.fn}`);
    expect([...new Set(found.filter((k) => !EXCEPTIONS[k]))]).toEqual([]);
  });

  it("every named exception is still a site (none is stale)", () => {
    const found = new Set(FILES.flatMap((f) => uncoveredSites(f, readFileSync(f, "utf8"), OWNED)).map((s) => `${s.file}#${s.fn}`));
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

  it("the document store's owner path reads the table through ownerState (source)", () => {
    const attach = readFileSync("src/lib/documents/attach.ts", "utf8");
    expect(attach).toMatch(/function contractTableState\([\s\S]*?actStatusFault\(act, status\)/);
    expect(attach).toMatch(/case "contract":\n\s+return contractTableState\(purpose, owner\.status\) \?\? contractOwnerState\(purpose, owner\);/);
    expect(attach).toMatch(/case "variationInstruction": \{[\s\S]*?contractTableState\(purpose, owner\.contractStatus\)/);
  });
});
