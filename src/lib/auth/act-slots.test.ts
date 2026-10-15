import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

import { ACT_SLOTS, NOT_AN_ACT, OTHER_HOLDER_ENTRY_POINTS, SIGNATURE_SLOTS, slotKey, slotOf } from "./act-slots";

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

  it("every label is also in Malay, and the Malay is not the English (Phase 2b: the shared attribution component reads a slot aloud)", () => {
    for (const s of ACT_SLOTS) {
      expect(s.ms.length, slotKey(s.entity, s.field)).toBeGreaterThan(3);
      expect(s.ms, slotKey(s.entity, s.field)).not.toBe(s.label);
      expect(s.ms, slotKey(s.entity, s.field)).not.toMatch(/[_.]|Id$/);
    }
  });

  // Changed deliberately in Phase 3d, to match the product owner's ruling of 2026-10-07 on the 2b review (FR-OPN-003): an opening authorisation is each present member's own, signed in
  // as themselves with their own password, and is no longer recorded from paper for a member. It joins the two configuration signatures as a signature that is not paper-capable.
  it("every signature-class slot a person signs may also be recorded from paper, except the two configuration ones, the opening authorisation, the conflict declaration and the panel verification, which are not", () => {
    // FR-APR-009 and FR-EST-005 (Phase 3d, "conflict declarations are signed" and "panel verifications are signed"): the declaration and the verification are the signer's own sign-in,
    // never recorded for them from paper (the signed paper form of the panel stays attached and required; an open item for the product owner).
    // Phase 4b (CPD, 2026-10-07): the check of a supplier's bank details joins them. It is the officer's own sign-in, with the statement open in front of them, and is not recorded for them from paper.
    const NOT_FROM_PAPER = ["ApprovalStep.declaredBy", "AuthorityMatrix.issuedByPerson", "BackdateConfirmation.confirmedBy", "ConfigurationChange.decidedBy", "EvaluationModel.issuedBy", "CreditorProfile.verifiedBy", "OpeningAuthorisation.person", "SpecPanelVerification.person", "OfficerExerciseKey.person", "PublishedKeyChange.by"];
    for (const s of SIGNATURE_SLOTS) {
      const key = slotKey(s.entity, s.field);
      expect(s.onBehalf, key).toBe(!NOT_FROM_PAPER.includes(key));
    }
  });
});

// Product owner's ruling, 2026-10-07 (2b(c)): an EOT claim answered with no loss-and-expense estimate has its own person column, registered with the flags of the slot the same act
// writes when an estimate is given, so one answer is judged the same whether or not it carries an estimate.
describe("the answer to an EOT claim has its own slot", () => {
  const flags = (s: { onBehalf: boolean; paperGated: boolean; signatureClass: boolean; holder?: string }) => ({ onBehalf: s.onBehalf, paperGated: s.paperGated, signatureClass: s.signatureClass, holder: s.holder });
  it("is registered with the same flags as LossExpenseClaim.person: paper-capable, not gated, not a signature, no administrator refusal", () => {
    const answer = slotOf("EotClaim", "answeredBy");
    const estimate = slotOf("LossExpenseClaim", "person");
    expect(answer).toBeDefined();
    expect(estimate).toBeDefined();
    expect(flags(answer!)).toEqual(flags(estimate!));
    expect(flags(answer!)).toEqual({ onBehalf: true, paperGated: false, signatureClass: false, holder: undefined });
  });
  it("is a column of the schema that is nullable, so a claim answered before sign-in reads \"before sign-in\" and no row is backfilled", () => {
    const model = /\nmodel EotClaim \{([\s\S]*?)\n\}/.exec(SCHEMA)![1];
    expect(model).toMatch(/\n\s+answeredByPersonId\s+String\?/);
  });
});

describe("the acts that move money, time or authority are recorded from paper only with the permission and the paper's reference (an open item for the product owner)", () => {
  it("are the ones the review named, each paper-capable and none a signature", () => {
    const gated = ACT_SLOTS.filter((s) => s.paperGated);
    expect(gated.map((s) => slotKey(s.entity, s.field)).sort()).toEqual(
      [
        "AdvancePayment.person",
        "EarlyActionDecision.person",
        "ExtensionOfTime.person",
        "FinancePayment.person",
        "InterimValuation.person",
        "LadWaiver.person",
        "LadWarning.person",
        "LossExpenseClaim.valuedBy",
        "PendingDeduction.person",
        "PeriodAgreement.person",
        "PeriodExtension.person",
        "RetentionRelease.person",
        "SoDelegation.grantorPerson",
        "SumAdjustment.person",
      ].sort(),
    );
    for (const s of gated) {
      expect(s.onBehalf, slotKey(s.entity, s.field)).toBe(true);
      expect(s.signatureClass, slotKey(s.entity, s.field)).toBe(false);
    }
  });
});

describe("the signature-class acts", () => {
  it("are the approvals, signatures and unsealings the programme names", () => {
    expect(SIGNATURE_SLOTS.map((s) => slotKey(s.entity, s.field)).sort()).toEqual(
      [
        "ApprovalStep.declaredBy",
        "ApprovalStep.decidedBy",
        "Award.signatoryPerson",
        "AuthorityMatrix.issuedByPerson",
        // Phase 5a, ruling item 9: the named authoriser's confirmation of a back-dated signature.
        "BackdateConfirmation.confirmedBy",
        "CertificateSignature.person",
        "ConfigurationChange.decidedBy",
        "ContractSignature.person",
        // Phase 4b: one officer's signed check of a supplier's bank details (FR-VND-005).
        "CreditorProfile.verifiedBy",
        "DiaryEndorsement.person",
        "EotClaim.determinedBy",
        // Phase 5a: issuing an evaluation model, by someone who did not make the draft (the matrix's act again).
        "EvaluationModel.issuedBy",
        "NonCompletion.person",
        // Wave 3b step 8 (ADR 0036 D4, ruling 20n): setting a share and changing a published key ask the sign-in password again.
        "OfficerExerciseKey.person",
        "OpeningAuthorisation.person",
        "OpeningSignature.person",
        "PublishedKeyChange.by",
        "ReconciliationAmendment.officer",
        "SpecPanelVerification.person",
        "Variation.soDecidedBy",
        "WorkProgramme.decidedBy",
      ].sort(),
    );
  });

  /// The acts an administrator may do, each with the reason in the registry (`administratorMay`). Everything else that attributes a person is refused to an administrator
  /// account by `beginAct` (NFR-SEC-004, the product owner's sweep, Phase 3d), signature-class or not.
  // Phase 5a adds the evaluation model's issue, the matrix's act again (the plan's 5a line: issued by a non-maker).
  const ADMINISTRATOR_MAY = ["AuthorityMatrix.issuedByPerson", "ConfigurationChange.decidedBy", "ConfigurationChange.proposedBy", "Delegation.fromPerson", "EvaluationModel.issuedBy"].sort();

  it("the acts an administrator account may do are exactly the four configuration acts the ruling names, each with its reason (the sweep of NFR-SEC-004)", () => {
    const may = ACT_SLOTS.filter((s) => s.administratorMay);
    expect(may.map((s) => slotKey(s.entity, s.field)).sort()).toEqual(ADMINISTRATOR_MAY);
    for (const s of may) expect(s.administratorMay!.length, slotKey(s.entity, s.field)).toBeGreaterThan(40);
  });

  it("an act an administrator may do names no kind of act it refuses one at, and the others that are signature-class do", () => {
    for (const s of SIGNATURE_SLOTS) {
      const key = slotKey(s.entity, s.field);
      if (s.administratorMay) expect(s.holder, key).toBeUndefined();
      else expect(s.holder, key).toBeDefined();
    }
  });

  it("a slot that names a kind of act it refuses an administrator names where it does, and the reverse: the registry claims no refusal nothing makes (review of Phase 2a)", () => {
    for (const s of ACT_SLOTS) {
      const key = slotKey(s.entity, s.field);
      if (s.holder) expect(s.entryPoints?.length ?? 0, `${key} says it refuses an administrator and names no entry point that does`).toBeGreaterThan(0);
      else expect(s.entryPoints, `${key} names entry points but no kind of act`).toBeUndefined();
    }
  });

  it("finds a slot by model and field", () => {
    expect(slotOf("Award", "signatoryPerson")?.label).toBe("Signed by");
    expect(slotOf("Award", "nothing")).toBeUndefined();
  });
});

/// The server actions the registry says refuse an administrator account, each asked first (Phase 2a).
describe("every wired entry point asks whether an administrator account may act, first", () => {
  const wired = [
    ...ACT_SLOTS.flatMap((s) => (s.entryPoints ?? []).map((e) => ({ slot: { holder: s.holder! }, entry: e }))),
    ...OTHER_HOLDER_ENTRY_POINTS.map((o) => ({ slot: { holder: o.holder }, entry: o.entry })),
  ];

  it("there are entry points, and each names a file and a function", () => {
    expect(wired.length).toBeGreaterThanOrEqual(30);
    for (const o of OTHER_HOLDER_ENTRY_POINTS) expect(o.why.length, o.entry).toBeGreaterThan(20);
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
      const first = at < 0 ? "" : raw.slice(span.from + at, span.from + at + 200);
      // A route handler asks `staffRoute({ ..., holder: "..." })`, an action `staffForAct("...")`.
      const isRoute = /\/route\.ts$/.test(file);
      const expected = isRoute ? new RegExp(String.raw`^await\s+staffRoute\(\{[^}]*\bholder:\s*"${w.slot.holder}"`) : new RegExp(String.raw`^await\s+staffForAct\(\s*"${w.slot.holder}"`);
      if (!expected.test(first)) wrong.push(`${w.entry}: first await is "${first.split("\n")[0]}", not ${isRoute ? `staffRoute({ holder: "${w.slot.holder}" })` : `staffForAct("${w.slot.holder}")`}`);
    }
    expect(wrong).toEqual([]);
  });

  it("names no function twice", () => {
    const names = wired.map((w) => w.entry);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});
