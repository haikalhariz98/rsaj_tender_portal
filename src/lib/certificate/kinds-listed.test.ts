import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { KIND_ROUTE_DOMAIN } from "@/lib/payment/route";
import { RECOMMENDING_ACT } from "@/lib/supervision/blocks";

import { KIND_FIGURE_KEYS } from "./fields";
import { formNeedFault, formNeeds } from "./form-needs";
import { certificateFaultWords } from "./fault-text";
import { draftSigningFaults, isMoneyBearing, KIND_ROUTE_RULE } from "./kinds";
import { matterSigning, type MatterFacts } from "@/lib/matter/matter";
import { KIND_WORDS } from "./labels";
import { CERTIFICATE_KINDS, type CertificateKind } from "./types";

/**
 * 6.13 Part B run 1a, the 6.14 increment 2 intake 2 (BD-613-96): "Each new kind in its own enum migration, in
 * CERTIFICATE_KINDS and KIND_WORDS EN+MS, on the needs list, with a test that every kind is listed." The eleven kinds
 * Part B raises are added now, each alone in a migration, and every exhaustive map over the kinds decides each of them.
 * No kind is raised yet (the raise acts come with runs 1b to 5); KIND_FIGURE_KEYS stays empty for them (BD-614-24).
 */

const PART_B: readonly CertificateKind[] = ["EOT", "CONTRACT_PERIOD_AGREEMENT", "PARTIAL_OCCUPATION", "PRACTICAL_COMPLETION", "SCHEDULE_OF_DEFECTS", "MAKING_GOOD_DEFECTS", "TERMINATION_INTENT", "TERMINATION", "TERMINATED_FINAL", "NOMINATION_LETTER", "FINAL"];
/// Review S5: the kinds whose approval of record is a contract matter's route.
const MATTER: readonly CertificateKind[] = ["EOT", "CONTRACT_PERIOD_AGREEMENT", "TERMINATION"];
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
      // Run 1a fix round (review S5, stricter): the three kinds approved on a contract matter fail closed.
      expect(KIND_ROUTE_RULE[k], k).toBe(routed[k] ? "APPROVED_ROUTE" : MATTER.includes(k) ? "MATTER_APPROVED" : "BY_ROUTING_TYPE");
      expect(isMoneyBearing(k)).toBe(routed[k] != null);
    }
  });

  it("the matter-approved kinds (EOT, period agreement, termination) and the nomination letters take their approval from a matter, never a second route", () => {
    for (const k of ["EOT", "CONTRACT_PERIOD_AGREEMENT", "TERMINATION", "NOMINATION_LETTER"] as const) expect(KIND_ROUTE_DOMAIN[k]).toBeNull();
  });

  it("S5, BD-613-121: EOT, the period agreement and the termination never reach signing with no approval: refused, from a draft and from routing, until their matter is approved", () => {
    // Phase 2 close-out stage A (flagged: matter signing replaces the fail-closed refusal, stricter in the approved
    // direction): with no matter found, or one not approved, every route state is still refused; the termination has no
    // record in Phase 2 (ruling 24), so it stays refused.
    const pending = (kind: "EOT" | "PERIOD_EXTENSION"): MatterFacts => ({ kind, reference: "M/1", closed: null, seriesSet: true, routes: [{ id: "r1", status: "PENDING" }], approvedRouteId: null });
    for (const k of MATTER) {
      for (const route of [null, "PENDING", "REJECTED", "RECALLED", "APPROVED"]) expect(draftSigningFaults(k, route, null).map((f) => f.code), `${k} ${route}`).toEqual(["MATTER_NOT_APPROVED"]);
      expect(matterSigning(k, null).map((f) => f.code), k).toEqual(["MATTER_NOT_APPROVED"]);
      expect(isMoneyBearing(k), k).toBe(false);
    }
    for (const [k, by] of [["EOT", "EOT"], ["CONTRACT_PERIOD_AGREEMENT", "PERIOD_EXTENSION"]] as const) {
      expect(matterSigning(k, pending(by)).map((f) => f.code), k).toEqual(["MATTER_NOT_APPROVED"]);
      expect(matterSigning(k, { ...pending(by), routes: [{ id: "r1", status: "APPROVED" }], approvedRouteId: "r1" }), k).toEqual([]);
    }
    expect(matterSigning("TERMINATION", { ...pending("EOT"), routes: [{ id: "r1", status: "APPROVED" }], approvedRouteId: "r1" }).map((f) => f.code)).toEqual(["MATTER_NOT_APPROVED"]);
    for (const k of CERTIFICATE_KINDS.filter((x) => !MATTER.includes(x))) expect(matterSigning(k, null), k).toEqual([]);
  });

  it("S5: the refusal's words, in English and Malay, never the money words", () => {
    const w = certificateFaultWords(matterSigning("EOT", null)[0]);
    expect(w.en).toBe("Needs its matter approved on its own route first."); // shortened by note 0005, founder 2026-10-19; the meaning pinned is unchanged
    expect(w.ms).toBe("Perakuan yang diluluskan melalui perkara kontrak hanya ditandatangani selepas perkara itu diluluskan pada laluannya sendiri, dan tiada perkara yang diluluskan direkodkan untuknya: ia tidak dihantar untuk tandatangan berdasarkan jenis penghalaannya sahaja.");
    expect(w.en).not.toMatch(/money/);
  });

  it("S5: the act asks it from a draft and from routing; the page asks the same (source)", () => {
    const write = readFileSync("src/lib/certificate/write.ts", "utf8");
    const body = write.slice(write.indexOf("export async function proceedToSigning("), write.indexOf("// ------------------------------------------------------------------ signatures and issue"));
    // BD-613-121: the matter of the certificate's record is read once, after the certificate's lock, for both paths.
    expect(body).toMatch(/const matterFacts = await certificateMatterFacts\(c\.tx, cert\);/);
    expect(body).toMatch(/draftSigningFaults\(cert\.kind as CertificateKind, routes\.length \? routes\[routes\.length - 1\]\.status : null, matterFacts\)/);
    expect(body).toMatch(/const matter = matterSigning\(cert\.kind as CertificateKind, matterFacts\);\n\s+if \(matter\.length\) refuse\("Not sent to signing:", matter\);/);
    expect(body.indexOf("matterSigning(")).toBeLessThan(body.indexOf("await moveTo(c, \"SIGNING\")"));
    const page = readFileSync("src/app/projects/[id]/certificates/[certId]/page.tsx", "utf8");
    expect(page).toMatch(/matterSigning\(cert\.kind as CertificateKind, await certificateMatterFacts\(db, cert\)\)/);
    expect(page).toMatch(/draftSigningFaults\(cert\.kind, routes\.length \? routes\[routes\.length - 1\]\.status : null, await certificateMatterFacts\(db, cert\)\)/);
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
