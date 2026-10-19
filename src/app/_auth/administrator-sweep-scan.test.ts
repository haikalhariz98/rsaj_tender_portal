import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isServerModule, lex, spans } from "@/lib/scan/source";
import { posixRelative, toPosix } from "@/lib/scan/files";

/**
 * NFR-SEC-004, the sweep (the product owner's ruling of 2026-10-07, applied in Phase 3d and completed in its review fix): an administrator account does no transactional,
 * approval or certification act. `beginAct` refuses one at every slot that attributes a person, but an action that writes with no slot of its own (a verdict at the opening,
 * a cancelled award, a voided certificate, a withdrawn document) never reaches `beginAct`, and none of the shared wrappers asks who is signed in. So the rule is held where
 * every action starts: each export of a server module outside Configuration asks `staffForAct(...)` FIRST, which hands an administrator's refusal back as the form's own
 * state, or is named below with the reason it is not a transaction.
 *
 * Configuration is an administrator's own work and is excluded as a whole (its editors are gated by product permission and maker-checker). The account page, the inbox and
 * sign-in are everyone's own business. Adding an export that neither asks nor is named fails here, which is the point.
 */

const APP = path.join(process.cwd(), "src", "app");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [toPosix(p)] : [];
  });
const rel = (f: string) => posixRelative(APP, f);

/// Not a procurement matter: an administrator's own configuration, a person's own account and inbox, and sign-in.
const OUTSIDE = (file: string) => /^(configuration|account|sign-in|inbox|_auth)\//.test(file);

interface Entry {
  file: string;
  name: string;
  /// With strings and comments blanked: for finding calls.
  body: string;
  /// As written: for reading an argument.
  raw: string;
}

function exportsOf(file: string, src: string): Entry[] {
  const m = lex(src);
  const out: Entry[] = [];
  for (const x of m.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g)) {
    const s = spans(m).find((sp) => sp.name === x[1] && sp.from > x.index!);
    if (s) out.push({ file, name: x[1], body: m.slice(s.from, s.to), raw: src.slice(s.from, s.to) });
  }
  return out;
}

const FILES = walk(APP).map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
const ENTRIES = FILES.filter((f) => isServerModule(f.src) && !OUTSIDE(f.file)).flatMap((f) => exportsOf(f.file, f.src));

/// Reads that write and attribute nothing: a drawer's or a panel's contents, and the list of what a document can be attached to. An administrator may look, as at any page.
const READS: Record<string, string> = {
  "documents/actions.ts#loadDocumentDrawer": "Reads one document for the drawer and writes nothing, so an administrator who may open the page may open the drawer.",
  "documents/actions.ts#loadOwnerPanel": "Reads an owner's documents panel for a drawer and writes nothing, so an administrator who may open the page may open the panel.",
  "documents/actions.ts#loadAttachTargets": "Reads the list of records a document could be attached to and writes nothing; the attaching is an act that is refused to an administrator.",
};

const asksFirst = (e: Entry): boolean => {
  const at = e.body.search(/\bawait\b/);
  if (at < 0) return false;
  return /^await\s+staffForAct\(\s*"(?:TRANSACTION|HOLDER_CHECKED|SIGNATURE|UNSEAL)"\s*\)/.test(e.raw.slice(at, at + 80)) && /^\{\s*(?:(?:const|let)\s+\w+\s*=\s*)?$/.test(e.body.slice(0, at).trim());
};

describe("an administrator account does no transactional act, at the entry of every action (NFR-SEC-004)", () => {
  it("finds the procurement actions it is about", () => {
    expect(ENTRIES.length).toBeGreaterThan(300);
    expect(ENTRIES.map((e) => e.file)).toContain("sourcing/[id]/opening/actions.ts");
    expect(ENTRIES.map((e) => e.file)).toContain("projects/[id]/certificates/[certId]/actions.ts");
    expect(ENTRIES.map((e) => e.file)).not.toContain("configuration/users/actions.ts");
  });

  it("recognises a guard first and an unguarded entry (self-test)", () => {
    const e = (src: string) => exportsOf("a.ts", src)[0];
    expect(asksFirst(e('export async function a(x) {\n  const g = await staffForAct("TRANSACTION");\n  if (!g.ok) return g.state;\n}'))).toBe(true);
    expect(asksFirst(e("export async function a(x) {\n  const actor = await requireStaff();\n}"))).toBe(false);
    expect(asksFirst(e('export async function a(x) {\n  const r = await read();\n  const g = await staffForAct("TRANSACTION");\n}'))).toBe(false);
    expect(asksFirst(e("export async function a(x) {\n  return 1;\n}"))).toBe(false);
  });

  it("every export asks staffForAct first, or is a named read", () => {
    const open = ENTRIES.filter((e) => !asksFirst(e) && !READS[`${e.file}#${e.name}`]).map((e) => `${e.file}: ${e.name}`);
    expect(open).toEqual([]);
  });

  it("every named read is still an export that does not ask, and says why in words", () => {
    for (const [key, why] of Object.entries(READS)) {
      const e = ENTRIES.find((x) => `${x.file}#${x.name}` === key);
      expect(e, key).toBeDefined();
      expect(asksFirst(e!), `${key} asks now, so it need not be named`).toBe(false);
      expect(why.length, key).toBeGreaterThan(40);
      // A read writes nothing.
      expect(e!.body, key).not.toMatch(/\.(?:create|update|updateMany|delete|deleteMany|upsert)\(|\$transaction|writeAudit\(/);
    }
  });
});
