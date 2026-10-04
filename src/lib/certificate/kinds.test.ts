import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { certificateFaultWords } from "./fault-text";
import { draftSigningFaults, isMoneyBearing, KIND_ROUTE_RULE } from "./kinds";
import { CERTIFICATE_KINDS, type CertificateKind } from "./types";

/**
 * 614-C1 (BD-614-9, placed at 6.13 Part A step 1): which kinds need an approved route before signing is a tested
 * rule, over every kind. A money-bearing kind never reaches SIGNING without an APPROVED route whatever its routing
 * type; every other kind follows its type (with one, through the sheet; with none, straight to signing).
 */

// 6.13 Part B run 1a (additive, faithful): the eleven Part B kinds join the two lists as kinds-listed.test.ts decides
// them; every assertion over the lists unchanged.
const MONEY: readonly CertificateKind[] = ["INTERIM_PAYMENT", "ADVANCE_PAYMENT", "VARIATION_APPLICATION", "VARIATION", "SUM_ADJUSTMENT", "PRACTICAL_COMPLETION", "MAKING_GOOD_DEFECTS", "TERMINATED_FINAL", "FINAL"];
const BY_TYPE: readonly CertificateKind[] = ["DELEGATION_LETTER", "DELEGATION_NOTICE", "LAD_WARNING", "NON_COMPLETION", "SO_INSTRUCTION", "PARTIAL_OCCUPATION", "SCHEDULE_OF_DEFECTS", "TERMINATION_INTENT", "NOMINATION_LETTER"];
// Run 1a fix round (review S5, stricter): approved on a contract matter, refused at signing until the matter answers.
const MATTER: readonly CertificateKind[] = ["EOT", "CONTRACT_PERIOD_AGREEMENT", "TERMINATION"];

describe("the map is exhaustive and decided for every kind", () => {
  it("covers exactly the schema's kinds", () => {
    expect(Object.keys(KIND_ROUTE_RULE).sort()).toEqual([...CERTIFICATE_KINDS].sort());
    expect([...MONEY, ...BY_TYPE, ...MATTER].sort()).toEqual([...CERTIFICATE_KINDS].sort());
  });
  for (const k of MONEY) {
    it(`${k}: money-bearing, needs an approved route`, () => {
      expect(isMoneyBearing(k)).toBe(true);
      for (const route of [null, "PENDING", "REJECTED", "RECALLED"]) expect(draftSigningFaults(k, route).map((f) => f.code), String(route)).toEqual(["MONEY_NEEDS_APPROVED_ROUTE"]);
      expect(draftSigningFaults(k, "APPROVED")).toEqual([]);
    });
  }
  for (const k of MATTER) {
    it(`${k}: approved on a contract matter, refused at signing whatever its route`, () => {
      expect(isMoneyBearing(k)).toBe(false);
      for (const route of [null, "PENDING", "REJECTED", "APPROVED"]) expect(draftSigningFaults(k, route).map((f) => f.code), String(route)).toEqual(["MATTER_NOT_APPROVED"]);
    });
  }
  for (const k of BY_TYPE) {
    it(`${k}: follows its routing type`, () => {
      expect(isMoneyBearing(k)).toBe(false);
      for (const route of [null, "PENDING", "REJECTED", "APPROVED"]) expect(draftSigningFaults(k, route)).toEqual([]);
    });
  }
});

describe("the refusal says what to do", () => {
  it("names the route's state, in both languages", () => {
    const t = (route: string | null) => certificateFaultWords(draftSigningFaults("INTERIM_PAYMENT", route)[0]);
    expect(t(null).en).toMatch(/signed only once its approval route is approved: none is open yet\. The module that raised it opens the route on the approval matrix\.$/);
    expect(t("PENDING").en).toMatch(/still waiting for a decision \(Approvals\)/);
    expect(t("REJECTED").en).toMatch(/was refused, and goes on only on a resubmitted route/);
    expect(t("RECALLED").en).toMatch(/recalled before a decision/);
    expect(t(null).ms).toMatch(/laluan kelulusannya diluluskan/);
  });
});

describe("the act and the page apply it (source)", () => {
  const read = (f: string) => readFileSync(path.join(__dirname, "../../..", f), "utf8");
  it("proceedToSigning refuses a money-bearing draft without an approved latest route; from routing it needs APPROVED", () => {
    const w = read("src/lib/certificate/write.ts");
    const body = w.slice(w.indexOf("export async function proceedToSigning("), w.indexOf("// ------------------------------------------------------------------ signatures and issue"));
    expect(body).toMatch(/draftSigningFaults\(cert\.kind as CertificateKind, routes\.length \? routes\[routes\.length - 1\]\.status : null\)/);
    expect(body).toMatch(/if \(sheet\.routeState === "PENDING"\)/);
    expect(body).toMatch(/if \(sheet\.routeState === "NONE"\)/);
  });
  it("the certificate page shows the same refusal beside the button", () => {
    expect(read("src/app/projects/[id]/certificates/[certId]/page.tsx")).toMatch(/draftSigningFaults\(cert\.kind/);
  });
});
