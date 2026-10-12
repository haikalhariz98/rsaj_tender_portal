/**
 * FR-MTD-012 enforced where the tender documents are made: the six behaviours of the
 * contract type that touch the pack (close-out CO-8). The other six are checked after
 * award (6.12, 6.13) and the screens say so.
 *
 * Read from the profile the exercise was decided under (its classification snapshot),
 * so a later edit of the type does not rewrite what the pack is judged by. A behaviour
 * not set is "not set" and blocks, never read as "no". Pure.
 */

import type { Sen } from "@/lib/money";
import type { BehaviourKey, BehaviourValue } from "@/lib/method/profile";

import type { AppendixFacts } from "./appendix";
import type { Finding, PackPartFacts } from "./types";

/// The six behaviours checked on the tender documents, in the order the card lists them.
export const BEHAVIOURS_CHECKED_HERE = ["pricingBasis", "registrationTest", "defectsLiabilityApplies", "nominationAllowed", "startRequiresSecurities", "interimPaymentRule"] as const satisfies readonly BehaviourKey[];

/// The six checked after award, with where.
export const BEHAVIOURS_AFTER_AWARD: readonly { key: BehaviourKey; where: "CONTRACT" | "POST_AWARD" }[] = [
  { key: "administratorRoleCodes", where: "CONTRACT" },
  { key: "eotInstrument", where: "POST_AWARD" },
  { key: "completionInstrument", where: "POST_AWARD" },
  { key: "makingGoodCertificate", where: "POST_AWARD" },
  { key: "sumAdjustmentDrivers", where: "POST_AWARD" },
  { key: "claimsApprovalCommitteeCode", where: "POST_AWARD" },
];

export type BehaviourFault = "PROFILE_NOT_RECORDED" | "BEHAVIOUR_NOT_SET" | "DLP_MONTHS_REQUIRED" | "DLP_NOT_FOR_TYPE" | "NOMINATION_NOT_FOR_TYPE" | "NOMINATION_BILL_NOT_CHECKED" | "BOND_FORMS_REQUIRED";

export interface BehaviourContext {
  /// The pack's Appendix, or null where its composition has none.
  appendix: Pick<AppendixFacts, "dlpApplies" | "dlpMonths" | "pcSumWorksApply" | "pcSumWorksText"> | null;
  /// The prime cost sums in the bill the pack issues (6.2 `bqTotals`), or null with no bill.
  primeCostSums: Sen | null;
  /// SR-09 (ruling 13): whether the bill is built on screen on this exercise, as pinned. False: the bill is a file the system does not read, so the bill's side of the nomination check is not made.
  /// Absent or true: it is made as before.
  billOnScreen?: boolean | null;
  parts: readonly Pick<PackPartFacts, "role" | "mandatory" | "inTableDocument" | "state">[];
}

/**
 * What the contract type asks of the pack. `profile` null: the exercise was decided before
 * profiles were recorded, so nothing can be checked and that blocks, naming it.
 */
export function behaviourFaults(profile: readonly { key: BehaviourKey; value: BehaviourValue }[] | null, ctx: BehaviourContext): Finding<BehaviourFault>[] {
  if (profile == null) return [{ code: "PROFILE_NOT_RECORDED", level: "block" }];
  const value = (k: BehaviourKey) => profile.find((p) => p.key === k)?.value ?? null;
  const out: Finding<BehaviourFault>[] = [];
  const notSet = (k: BehaviourKey) => out.push({ code: "BEHAVIOUR_NOT_SET", level: "block", data: { behaviour: k } });

  // (a) and (b): how it is priced, and the registration test the notice states (FR-DOC-005).
  if (value("pricingBasis") == null) notSet("pricingBasis");
  if (value("registrationTest") == null) notSet("registrationTest");

  // (c) A defects liability period: stated in months where the type has one, absent where it has none.
  const dlp = value("defectsLiabilityApplies");
  if (dlp == null) notSet("defectsLiabilityApplies");
  else if (dlp === true && (ctx.appendix?.dlpApplies !== true || ctx.appendix.dlpMonths == null)) out.push({ code: "DLP_MONTHS_REQUIRED", level: "block", data: { appendix: ctx.appendix ? 1 : 0 } });
  else if (dlp === false && ctx.appendix && (ctx.appendix.dlpApplies === true || ctx.appendix.dlpMonths != null)) out.push({ code: "DLP_NOT_FOR_TYPE", level: "block" });

  // (d) Nomination: a type that allows none takes no prime cost sum, in the bill or the Appendix.
  const nomination = value("nominationAllowed");
  if (nomination == null) notSet("nominationAllowed");
  else if (nomination === false) {
    // SR-09: with no on-screen bill there are no prime cost sums to read, so the bill's side is "not checked", never a pass. The Appendix's answer below is still checked.
    if (ctx.billOnScreen === false) out.push({ code: "NOMINATION_BILL_NOT_CHECKED", level: "info" });
    else if (ctx.primeCostSums != null && ctx.primeCostSums > 0n) out.push({ code: "NOMINATION_NOT_FOR_TYPE", level: "block", data: { where: "BILL" } });
    if (ctx.appendix && (ctx.appendix.pcSumWorksApply === true || ctx.appendix.pcSumWorksText.trim() !== "")) out.push({ code: "NOMINATION_NOT_FOR_TYPE", level: "block", data: { where: "APPENDIX" } });
  }

  // (e) Securities before start: the bond forms bound in, mandatory, in the Tender Table Document (FR-DOC-007).
  const securities = value("startRequiresSecurities");
  if (securities == null) notSet("startRequiresSecurities");
  else if (securities === true && !ctx.parts.some((p) => p.role === "BOND_FORMS" && p.mandatory === true && p.inTableDocument === true && p.state !== "OMITTED")) out.push({ code: "BOND_FORMS_REQUIRED", level: "block" });

  // (f) Interim payments: the Appendix's interim minimums are stated only under a rule.
  if (value("interimPaymentRule") == null) notSet("interimPaymentRule");
  return out;
}
