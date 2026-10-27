/**
 * The twelve downstream behaviours a contract type drives (FR-MTD-012), as a profile.
 * Each is shown as set or not set — never a null read as "no". Enforced where each
 * behaviour lives (6.4, 6.12, 6.13).
 */

import { isSumAdjustmentTrigger, SUM_ADJUSTMENT_TRIGGER_WORDS } from "./behaviour-twins";
import { PAYMENT_ROUTE_LABEL } from "./labels";
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

/**
 * Where a free-text behaviour has a typed twin that is set, the twin is what the type says (Phase 0.2 item 6): how it is paid stands for the interim
 * payment rule, and the adjustment triggers for the sum adjustment drivers. The settings drawer then offers only the twin.
 */
const twinned = (type: ContractBehaviours, key: BehaviourKey): BehaviourValue => {
  if (key === "interimPaymentRule" && type.paymentRoute) return PAYMENT_ROUTE_LABEL[type.paymentRoute];
  const triggers = (type.sumAdjustmentTriggers ?? []).filter(isSumAdjustmentTrigger);
  if (key === "sumAdjustmentDrivers" && triggers.length > 0) return triggers.map((t) => SUM_ADJUSTMENT_TRIGGER_WORDS[t].en);
  return type[key] as BehaviourValue;
};

export function behaviourProfile(type: ContractBehaviours): { key: BehaviourKey; value: BehaviourValue }[] {
  return BEHAVIOUR_KEYS.map((key) => {
    const v = twinned(type, key);
    const unset = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === "string" && v.trim() === "");
    return { key, value: unset ? null : v };
  });
}
