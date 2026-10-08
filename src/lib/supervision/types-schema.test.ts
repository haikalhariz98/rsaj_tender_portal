import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as L from "./labels";
import * as T from "./types";

/** Every supervision list equals the schema's enum, in order, and every word map covers it (X-8), EN and MS. */

const schema = readFileSync(path.join(__dirname, "../../../prisma/schema.prisma"), "utf8");
const values = (name: string) => {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1].split("\n").map((l) => l.replace(/\/\/\/.*$/, "").trim()).filter(Boolean);
};

const PAIRS: [string, readonly string[], Readonly<Record<string, { en: string; ms: string }>> | null][] = [
  ["SoAssignmentReason", T.SO_ASSIGNMENT_REASONS, L.SO_REASON_WORDS],
  ["DelegateKind", T.DELEGATE_KINDS, L.DELEGATE_KIND_WORDS],
  ["SupervisionAct", T.SUPERVISION_ACTS, L.ACT_WORDS],
  ["ProgrammeKind", T.PROGRAMME_KINDS, L.PROGRAMME_KIND_WORDS],
  ["ProgrammeDecision", T.PROGRAMME_DECISIONS, L.PROGRAMME_DECISION_WORDS],
  ["DiaryEndorser", T.DIARY_ENDORSERS, L.ENDORSER_WORDS],
  ["ComplianceArea", T.COMPLIANCE_AREAS, L.AREA_WORDS],
  ["DirectionCause", T.DIRECTION_CAUSES, L.CAUSE_WORDS],
  ["PendingDeductionKind", T.PENDING_DEDUCTION_KINDS, L.DEDUCTION_KIND_WORDS],
  ["EarlyActionBranch", T.EARLY_ACTION_BRANCHES, L.BRANCH_WORDS],
  ["ContractPartyKind", T.CONTRACT_PARTY_KINDS, L.PARTY_KIND_WORDS],
  ["SiteRecordsSet", T.SITE_RECORDS_SETS, L.RECORDS_SET_WORDS],
  ["DelegationVariant", T.DELEGATION_VARIANTS, L.VARIANT_WORDS],
];

describe("the vocabulary matches the schema, and every value has its words", () => {
  for (const [name, list, words] of PAIRS) {
    it(name, () => {
      expect([...list]).toEqual(values(name));
      if (words) {
        expect(Object.keys(words).sort()).toEqual([...list].sort());
        for (const k of list) {
          expect(words[k].en.length, k).toBeGreaterThan(0);
          expect(words[k].ms.length, k).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe("every refusal the supervision rules can give is worded", () => {
  it("no code falls through to 'Refused'", () => {
    const src = ["so", "authority", "delegation", "possession", "programme", "delay", "diary", "records"].map((f) => readFileSync(path.join(__dirname, `${f}.ts`), "utf8")).join("\n");
    const codes = new Set([...src.matchAll(/"([A-Z][A-Z_]{3,})"/g)].map((m) => m[1]));
    const notFaults = new Set([...T.SUPERVISION_ACTS, ...T.DELEGATE_KINDS, ...T.EARLY_ACTION_BRANCHES, ...T.SITE_RECORDS_SETS, ...T.PROGRAMME_DECISIONS, "RESOLVED", "SO_UNRESOLVED_X", "IN_DELAY", "ON_TRACK", "NOT_SET", "NOT_JUDGED", "LAPSED", "BEHIND", "NOT_POSSESSED", "NO_PROGRAMME", "NO_PROGRESS", "BEFORE_PROGRAMME", "COMPLETE", "AWAITING_OFFICER", "AWAITING_AGENT", "AWAITING_BOTH", "DISPUTED", "OFFICER", "AGENT", "LETTER_NOT_ISSUED", "IN_FORCE", "REVOKED", "LETTER_VOID", "ISSUED", "VOID", "DELEGATE", "SECURITIES_FIRST", "WITHOUT_SECURITIES", "PART_B", "LAD_CHAIN", "STAMPED", "BOND", "INSURANCE", "MET", "APPROVED", "PRINCIPAL", "CANCELLED", "AWARD", "NO_RULE", "EXECUTION", /* what a representative is not offered (hiddenNeedsFor), not a refusal */ "SO_ONLY", "PRINCIPAL_OR_SO"]);
    const missing = [...codes].filter((c) => !notFaults.has(c) && L.supervisionFaultWords({ code: c, level: "block", data: {} }).en === "Refused.");
    expect(missing).toEqual([]);
  });
});
