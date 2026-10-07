import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

import { ACT_SLOTS, NOT_AN_ACT, SIGNATURE_SLOTS, slotKey, slotOf } from "./act-slots";

/**
 * The person slots of every act (ADR 0034 D12, Phase 2a). The schema is the source of truth for which columns name a Person, and this scan holds
 * the registry to it in both directions: a Person relation that is in neither `ACT_SLOTS` nor `NOT_AN_ACT` fails (so a new act cannot add a person
 * column that nobody attributes), and an entry that names a model or field the schema no longer has fails too.
 */

const ROOT = process.cwd();
const SCHEMA = readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8");

/// Every foreign key to Person in the schema, as `Model.field`. The back-relations on Person itself are lists, and are not foreign keys.
export function personRelations(schema: string): string[] {
  const found: string[] = [];
  let model: string | null = null;
  for (const line of schema.split(/\r?\n/)) {
    const m = line.match(/^model (\w+) \{/);
    if (m) {
      model = m[1];
      continue;
    }
    if (line.startsWith("}")) {
      model = null;
      continue;
    }
    if (!model || model === "Person") continue;
    const f = line.match(/^\s+(\w+)\s+Person\??\s+@relation\(([^)]*)\)/);
    if (f && /fields:/.test(f[2])) found.push(slotKey(model, f[1]));
  }
  return found;
}

const RELATIONS = personRelations(SCHEMA);
const SLOT_KEYS = ACT_SLOTS.map((s) => slotKey(s.entity, s.field));

describe("the schema scan finds what it should", () => {
  it("reads the Person relations of the schema, and only the foreign keys", () => {
    expect(RELATIONS.length).toBeGreaterThan(140);
    expect(RELATIONS).toContain("ApprovalStep.decidedBy");
    expect(RELATIONS).toContain("Variation.soDecidedBy");
    // A list on Person, and Person's own relations, are not foreign keys.
    expect(RELATIONS.some((r) => r.startsWith("Person."))).toBe(false);
    expect(personRelations("model A {\n  id String\n  who Person? @relation(fields: [whoId], references: [id])\n  others Person[]\n}\nmodel Person {\n  a A[]\n}")).toEqual(["A.who"]);
  });
});

describe("every Person relation is an act slot or is accounted for", () => {
  it("none is in neither list", () => {
    const known = new Set([...SLOT_KEYS, ...Object.keys(NOT_AN_ACT)]);
    expect(RELATIONS.filter((r) => !known.has(r))).toEqual([]);
  });

  it("none is in both", () => {
    expect(SLOT_KEYS.filter((k) => k in NOT_AN_ACT)).toEqual([]);
  });

  it("no entry names a relation the schema does not have", () => {
    const relations = new Set(RELATIONS);
    expect([...SLOT_KEYS, ...Object.keys(NOT_AN_ACT)].filter((k) => !relations.has(k))).toEqual([]);
  });

  it("no slot is listed twice", () => {
    expect(SLOT_KEYS.filter((k, i) => SLOT_KEYS.indexOf(k) !== i)).toEqual([]);
  });

  it("every exclusion says why", () => {
    for (const [key, reason] of Object.entries(NOT_AN_ACT)) expect(reason.length, key).toBeGreaterThan(15);
  });

  it("every slot has a label to read it by, in words and never a code", () => {
    for (const s of ACT_SLOTS) {
      expect(s.label.length, slotKey(s.entity, s.field)).toBeGreaterThan(3);
      expect(s.label, slotKey(s.entity, s.field)).not.toMatch(/[_.]|Id$/);
    }
  });
});

describe("the signature-class acts", () => {
  it("are the approvals, signatures and unsealings the programme names", () => {
    expect(SIGNATURE_SLOTS.map((s) => slotKey(s.entity, s.field)).sort()).toEqual(
      [
        "ApprovalStep.decidedBy",
        "Award.signatoryPerson",
        "AuthorityMatrix.issuedByPerson",
        "CertificateSignature.person",
        "ConfigurationChange.decidedBy",
        "ContractSignature.person",
        "DiaryEndorsement.person",
        "EotClaim.determinedBy",
        "NonCompletion.person",
        "OpeningAuthorisation.person",
        "OpeningSignature.person",
        "ReconciliationAmendment.officer",
        "Variation.soDecidedBy",
        "WorkProgramme.decidedBy",
      ].sort(),
    );
  });

  it("each says which kind of act an administrator account is refused at, except the checker's decision, which an administrator makes", () => {
    for (const s of SIGNATURE_SLOTS) {
      if (slotKey(s.entity, s.field) === "ConfigurationChange.decidedBy") expect(s.holder).toBeUndefined();
      else expect(s.holder, slotKey(s.entity, s.field)).toBeDefined();
    }
  });

  it("finds a slot by model and field", () => {
    expect(slotOf("Award", "signatoryPerson")?.label).toBe("Signed by");
    expect(slotOf("Award", "nothing")).toBeUndefined();
  });
});

/// The server actions the registry says refuse an administrator account, each asked first (Phase 2a).
describe("every wired entry point asks whether an administrator account may act, first", () => {
  const wired = ACT_SLOTS.flatMap((s) => (s.entryPoints ?? []).map((e) => ({ slot: s, entry: e })));

  it("there are entry points, and each names a file and a function", () => {
    expect(wired.length).toBeGreaterThan(8);
    for (const w of wired) expect(w.entry, w.entry).toMatch(/^src\/.+\.tsx?#\w+$/);
  });

  it("each exists, and its first awaited call is the one that refuses an administrator, for the kind of act the slot says", () => {
    const wrong: string[] = [];
    for (const w of wired) {
      const [file, fn] = w.entry.split("#");
      const abs = path.join(ROOT, file);
      if (!existsSync(abs)) {
        wrong.push(`${w.entry}: no such file`);
        continue;
      }
      const raw = readFileSync(abs, "utf8");
      const m = lex(raw);
      const span = spans(m).find((s) => s.name === fn);
      if (!span) {
        wrong.push(`${w.entry}: no such function`);
        continue;
      }
      // The lexed text (strings blanked, same length) finds the first await; the raw text reads the act it names.
      const at = m.slice(span.from, span.to).search(/\bawait\b/);
      const first = at < 0 ? "" : raw.slice(span.from + at, span.from + at + 80);
      const expected = new RegExp(String.raw`^await\s+staffForAct\(\s*"${w.slot.holder}"`);
      if (!expected.test(first)) wrong.push(`${w.entry}: first await is "${first.split("\n")[0]}", not staffForAct("${w.slot.holder}")`);
    }
    expect(wrong).toEqual([]);
  });

  it("names no function twice", () => {
    const names = wired.map((w) => w.entry);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});
