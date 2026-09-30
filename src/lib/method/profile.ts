/**
 * The twelve downstream behaviours a contract type drives (FR-MTD-012), as a profile.
 * Each is shown as set or not set — never a null read as "no". Enforced where each
 * behaviour lives (6.4, 6.12, 6.13).
 */

import type { ContractBehaviours } from "./types";

export const BEHAVIOUR_KEYS = [
  "pricingBasis",
  "registrationTest",
  "administratorRoleCodes",
  "startRequiresSecurities",
  "eotInstrument",
  "completionInstrument",
  "defectsLiabilityApplies",
  "makingGoodCertificate",
  "nominationAllowed",
  "interimPaymentRule",
  "sumAdjustmentDrivers",
  "claimsApprovalCommitteeCode",
] as const satisfies readonly (keyof ContractBehaviours)[];

export type BehaviourKey = (typeof BEHAVIOUR_KEYS)[number];
export type BehaviourValue = string | boolean | string[] | null;

export function behaviourProfile(type: ContractBehaviours): { key: BehaviourKey; value: BehaviourValue }[] {
  return BEHAVIOUR_KEYS.map((key) => {
    const v = type[key] as BehaviourValue;
    const unset = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === "string" && v.trim() === "");
    return { key, value: unset ? null : v };
  });
}
