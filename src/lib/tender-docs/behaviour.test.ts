import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import { BEHAVIOUR_KEYS, behaviourProfile } from "@/lib/method/profile";
import type { ContractBehaviours } from "@/lib/method/types";

import { BEHAVIOURS_AFTER_AWARD, BEHAVIOURS_CHECKED_HERE, behaviourFaults, type BehaviourContext } from "./behaviour";

/**
 * Plan 6.4 test 6 (FR-MTD-012): a Supply profile (no DLP, no nomination) refuses a DLP of
 * 12 months and a bill with an RM18,000.00 prime cost sum; a Works profile with a DLP and
 * no months blocks. Changing the type changes the findings.
 */

const base: ContractBehaviours = {
  pricingBasis: "Lump sum",
  registrationTest: "Registered for the work's grade and category",
  administratorRoleCodes: ["HOD_CP"],
  startRequiresSecurities: false,
  eotInstrument: "EOT certificate",
  completionInstrument: "Certificate of practical completion",
  defectsLiabilityApplies: true,
  makingGoodCertificate: true,
  nominationAllowed: true,
  interimPaymentRule: "Monthly valuation",
  sumAdjustmentDrivers: ["Variation"],
  claimsApprovalCommitteeCode: null,
};
const works = behaviourProfile(base);
const supply = behaviourProfile({ ...base, defectsLiabilityApplies: false, nominationAllowed: false });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const bond = { role: "BOND_FORMS" as const, mandatory: true, inTableDocument: true, state: "READY" as const };
const ctx = (x: Partial<BehaviourContext> = {}): BehaviourContext => ({
  appendix: { dlpApplies: true, dlpMonths: 12, pcSumWorksApply: false, pcSumWorksText: "" },
  primeCostSums: 0n,
  parts: [bond],
  ...x,
});

describe("test 6: the contract type binds the pack", () => {
  it("a Works profile with a DLP of 12 months passes", () => {
    expect(behaviourFaults(works, ctx())).toEqual([]);
  });

  it("a Works profile with a DLP and no months blocks", () => {
    expect(codes(behaviourFaults(works, ctx({ appendix: { dlpApplies: true, dlpMonths: null, pcSumWorksApply: false, pcSumWorksText: "" } })))).toEqual(["DLP_MONTHS_REQUIRED"]);
    // And where the pack has no Appendix to state it in.
    expect(behaviourFaults(works, ctx({ appendix: null }))).toEqual([{ code: "DLP_MONTHS_REQUIRED", level: "block", data: { appendix: 0 } }]);
  });

  it("a Supply profile refuses a 12-month DLP and a bill with an RM18,000.00 prime cost sum", () => {
    const f = behaviourFaults(supply, ctx({ primeCostSums: parseSen("18000.00") }));
    expect(codes(f)).toEqual(["DLP_NOT_FOR_TYPE", "NOMINATION_NOT_FOR_TYPE"]);
    expect(f[1].data).toEqual({ where: "BILL" });
  });

  it("a Supply profile refuses prime cost sum work written in the Appendix", () => {
    const f = behaviourFaults(supply, ctx({ appendix: { dlpApplies: false, dlpMonths: null, pcSumWorksApply: true, pcSumWorksText: "Chlorinator" } }));
    expect(f).toEqual([{ code: "NOMINATION_NOT_FOR_TYPE", level: "block", data: { where: "APPENDIX" } }]);
  });

  it("changing the type changes the findings, with nothing else changed", () => {
    const same = ctx({ primeCostSums: parseSen("18000.00") });
    expect(behaviourFaults(works, same)).toEqual([]);
    expect(behaviourFaults(supply, same)).not.toEqual([]);
  });

  it("securities before start need the bond forms bound in, mandatory, in the table document (FR-DOC-007)", () => {
    const secured = behaviourProfile({ ...base, startRequiresSecurities: true });
    expect(behaviourFaults(secured, ctx())).toEqual([]);
    expect(codes(behaviourFaults(secured, ctx({ parts: [] })))).toEqual(["BOND_FORMS_REQUIRED"]);
    expect(codes(behaviourFaults(secured, ctx({ parts: [{ ...bond, inTableDocument: false }] })))).toEqual(["BOND_FORMS_REQUIRED"]);
    expect(codes(behaviourFaults(secured, ctx({ parts: [{ ...bond, mandatory: null }] })))).toEqual(["BOND_FORMS_REQUIRED"]);
    expect(codes(behaviourFaults(secured, ctx({ parts: [{ ...bond, state: "OMITTED" }] })))).toEqual(["BOND_FORMS_REQUIRED"]);
  });

  it("each behaviour not set blocks, never read as no", () => {
    const blank = behaviourProfile({ ...base, pricingBasis: null, registrationTest: " ", defectsLiabilityApplies: null, nominationAllowed: null, startRequiresSecurities: null, interimPaymentRule: null });
    const f = behaviourFaults(blank, ctx({ primeCostSums: parseSen("18000.00"), parts: [] }));
    expect(f.map((x) => x.data?.behaviour)).toEqual(["pricingBasis", "registrationTest", "defectsLiabilityApplies", "nominationAllowed", "startRequiresSecurities", "interimPaymentRule"]);
    expect(codes(f).every((c) => c === "BEHAVIOUR_NOT_SET")).toBe(true);
  });

  it("an exercise decided before profiles were recorded blocks, naming it", () => {
    expect(codes(behaviourFaults(null, ctx()))).toEqual(["PROFILE_NOT_RECORDED"]);
  });

  it("the card's two halves are the twelve behaviours, each once", () => {
    expect([...BEHAVIOURS_CHECKED_HERE, ...BEHAVIOURS_AFTER_AWARD.map((b) => b.key)].sort()).toEqual([...BEHAVIOUR_KEYS].sort());
  });
});
