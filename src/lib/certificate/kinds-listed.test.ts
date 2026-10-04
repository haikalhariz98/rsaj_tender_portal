import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { KIND_ROUTE_DOMAIN } from "@/lib/payment/route";
import { RECOMMENDING_ACT } from "@/lib/supervision/blocks";

import { KIND_FIGURE_KEYS } from "./fields";
import { formNeedFault, formNeeds } from "./form-needs";
import { isMoneyBearing, KIND_ROUTE_RULE } from "./kinds";
import { KIND_WORDS } from "./labels";
import { CERTIFICATE_KINDS, type CertificateKind } from "./types";

/**
 * 6.13 Part B run 1a, the 6.14 increment 2 intake 2 (BD-613-96): "Each new kind in its own enum migration, in
 * CERTIFICATE_KINDS and KIND_WORDS EN+MS, on the needs list, with a test that every kind is listed." The eleven kinds
 * Part B raises are added now, each alone in a migration, and every exhaustive map over the kinds decides each of them.
 * No kind is raised yet (the raise acts come with runs 1b to 5); KIND_FIGURE_KEYS stays empty for them (BD-614-24).
 */

const PART_B: readonly CertificateKind[] = ["EOT", "CONTRACT_PERIOD_AGREEMENT", "PARTIAL_OCCUPATION", "PRACTICAL_COMPLETION", "SCHEDULE_OF_DEFECTS", "MAKING_GOOD_DEFECTS", "TERMINATION_INTENT", "TERMINATION", "TERMINATED_FINAL", "NOMINATION_LETTER", "FINAL"];
const schema = readFileSync("prisma/schema.prisma", "utf8");
const schemaKinds = /\nenum CertificateKind \{([\s\S]*?)\n\}/.exec(schema)![1].split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));

describe("every kind is listed", () => {
  it("CERTIFICATE_KINDS is the schema's enum, in order, and holds the eleven Part B kinds", () => {
    expect([...CERTIFICATE_KINDS]).toEqual(schemaKinds);
    for (const k of PART_B) expect(CERTIFICATE_KINDS).toContain(k);
  });

  it("each Part B kind arrived alone in its own migration", () => {
    for (const k of PART_B) {
      const dir = `prisma/migrations/${readdirOne(`certificate_kind_${k.toLowerCase()}`)}`;
      const sql = readFileSync(`${dir}/migration.sql`, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
      expect(sql).toEqual([`ALTER TYPE "CertificateKind" ADD VALUE '${k}';`]);
    }
  });

  it("every kind has its words in English and Malay, never its code", () => {
    for (const k of CERTIFICATE_KINDS) {
      expect(KIND_WORDS[k].en, k).toMatch(/^[A-Z][a-z]/);
      expect(KIND_WORDS[k].ms, k).toMatch(/^[A-Z][a-z]/);
      expect(KIND_WORDS[k].en).not.toBe(KIND_WORDS[k].ms);
      expect(KIND_WORDS[k].en).not.toMatch(/[A-Z]{2,}_/);
    }
  });

  it("every kind is on the needs list (the delegation pair once per contract-type variant), and its refusal names it in both languages", () => {
    const keys = formNeeds({ kinds: {}, delegation: { CONVENTIONAL: { letter: null, notice: null }, DESIGN_AND_BUILD: { letter: null, notice: null } }, sheets: [] }).map((n) => n.key.split(":")[0]);
    expect([...new Set(keys)]).toEqual([...CERTIFICATE_KINDS]);
    for (const k of PART_B) expect(formNeedFault(null, KIND_WORDS[k])).toEqual({ code: "TEMPLATE_NOT_SET", level: "block", data: { need: KIND_WORDS[k].en, needMs: KIND_WORDS[k].ms, setAt: "POST_AWARD" } });
  });
});

describe("every map over the kinds decides each Part B kind", () => {
  it("routes: the certificate's own route where the plan routes it (CPC, CMGD, PMKD(T), final), otherwise its routing type", () => {
    const routed: Partial<Record<CertificateKind, string>> = { PRACTICAL_COMPLETION: "practical_completion", MAKING_GOOD_DEFECTS: "making_good", TERMINATED_FINAL: "final_payment", FINAL: "final_payment" };
    for (const k of PART_B) {
      expect(KIND_ROUTE_DOMAIN[k], k).toBe(routed[k] ?? null);
      expect(KIND_ROUTE_RULE[k], k).toBe(routed[k] ? "APPROVED_ROUTE" : "BY_ROUTING_TYPE");
      expect(isMoneyBearing(k)).toBe(routed[k] != null);
    }
  });

  it("the matter-approved kinds (EOT, period agreement, termination) and the nomination letters take their approval from a matter, never a second route", () => {
    for (const k of ["EOT", "CONTRACT_PERIOD_AGREEMENT", "TERMINATION", "NOMINATION_LETTER"] as const) expect(KIND_ROUTE_DOMAIN[k]).toBeNull();
  });

  it("no figure key and no recommending supervision act yet: each kind's assembler declares its own in its run", () => {
    for (const k of PART_B) {
      expect(KIND_FIGURE_KEYS[k], k).toEqual([]);
      expect(RECOMMENDING_ACT[k], k).toBeNull();
    }
  });
});

function readdirOne(suffix: string): string {
  const names = readdirSync("prisma/migrations").filter((d) => d.endsWith(`_${suffix}`));
  if (names.length !== 1) throw new Error(`expected one migration ending ${suffix}, found ${names.length}`);
  return names[0];
}
