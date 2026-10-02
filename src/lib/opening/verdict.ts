/**
 * The opening's verdict on one bid (FR-OPN-008, 009; R12; OD-4): PASS carries it to evaluation,
 * REJECT does not. The panel judges only on grounds the rules make eliminatory — it does not evaluate:
 *
 * - completeness (FR-BID-007, R12, D10): a document answered ABSENT eliminates only where the method
 *   (as frozen at publication, 6.6 CR-2) says it does; where it says "report", the bid passes and the
 *   gap is reported to the committee, which decides (a REJECT on completeness alone is refused);
 *   unset blocks;
 * - the sale (X-11, OD-4): a bidder with no live sale, or not invited, is eliminated or reported by
 *   the method's `unpurchasedBidConsequence`; unset blocks only where such a bid exists;
 * - the restriction (FR-DOC-009, SK001 7.3.4 (a)): NOT_EVIDENCED is eliminatory;
 * - an alternative the documents do not permit is recorded, never considered: never PASS.
 *
 * A PASS is refused while any eliminatory ground stands; a REJECT is refused without one, and needs
 * the reason in words. Every item must be answered, and the checklist judged (6.6 ruling). Pure.
 */

import { missingItems, unansweredItems, type ChecklistItem, type OpeningChecklist } from "./checklist";
import { actFaults, type ActFault, type OpeningState } from "./state";
import type { AlternativeConsideration, ChecklistAnswer, Finding, OpeningVerdict, RestrictionFinding, SaleFinding, UnpurchasedConsequence } from "./types";

export type Ground = "INCOMPLETE" | "NOT_PURCHASED" | "NOT_INVITED" | "NOT_EVIDENCED" | "ALTERNATIVE_NOT_CONSIDERED";
export type Reported = "INCOMPLETE_REPORTED" | "NOT_PURCHASED_REPORTED" | "NOT_INVITED_REPORTED";

export interface BidForVerdict {
  saleFinding: SaleFinding;
  restrictionFinding: RestrictionFinding;
  isAlternative: boolean;
  alternativeStatus: AlternativeConsideration | null;
}

export interface VerdictPolicy {
  completenessEliminates: boolean | null;
  unpurchased: UnpurchasedConsequence | null;
}

export type NotSetFault = "CHECKLIST_NOT_JUDGED" | "ANSWERS_INCOMPLETE" | "CONSEQUENCE_NOT_SET" | "UNPURCHASED_CONSEQUENCE_NOT_SET" | "ALTERNATIVES_NOT_STATED";

/// What the rules make of one bid: the items missing, the eliminatory grounds, what is reported, and what is not set.
export function judgeBid(bid: BidForVerdict, checklist: OpeningChecklist, answers: ReadonlyMap<string, ChecklistAnswer>, policy: VerdictPolicy): { missing: ChecklistItem[]; unanswered: ChecklistItem[]; grounds: Ground[]; reported: Reported[]; notSet: Finding<NotSetFault>[] } {
  const missing = missingItems(checklist.items, answers);
  const unanswered = unansweredItems(checklist.items, answers);
  const grounds: Ground[] = [];
  const reported: Reported[] = [];
  const notSet: Finding<NotSetFault>[] = [];
  if (checklist.notJudged.length) notSet.push({ code: "CHECKLIST_NOT_JUDGED", level: "block", data: { parts: checklist.notJudged.join(", ") } });
  if (unanswered.length) notSet.push({ code: "ANSWERS_INCOMPLETE", level: "block", data: { count: unanswered.length } });
  if (policy.completenessEliminates == null) notSet.push({ code: "CONSEQUENCE_NOT_SET", level: "block" });
  else if (missing.length) {
    if (policy.completenessEliminates) grounds.push("INCOMPLETE");
    else reported.push("INCOMPLETE_REPORTED");
  }
  if (bid.saleFinding !== "LIVE_SALE") {
    const invite = bid.saleFinding === "NOT_ON_INVITEE_LIST";
    if (policy.unpurchased == null) notSet.push({ code: "UNPURCHASED_CONSEQUENCE_NOT_SET", level: "block" });
    else if (policy.unpurchased === "ELIMINATE") grounds.push(invite ? "NOT_INVITED" : "NOT_PURCHASED");
    else reported.push(invite ? "NOT_INVITED_REPORTED" : "NOT_PURCHASED_REPORTED");
  }
  if (bid.restrictionFinding === "NOT_EVIDENCED") grounds.push("NOT_EVIDENCED");
  if (bid.isAlternative) {
    if (bid.alternativeStatus == null) notSet.push({ code: "ALTERNATIVES_NOT_STATED", level: "block" });
    else if (bid.alternativeStatus === "NOT_CONSIDERED") grounds.push("ALTERNATIVE_NOT_CONSIDERED");
  }
  return { missing, unanswered, grounds, reported, notSet };
}

export type VerdictFault =
  | ActFault
  | NotSetFault
  | "NOT_THIS_OPENING"
  | "VERDICT_REQUIRED"
  | "PASS_WITH_MISSING_DOCUMENT"
  | "PASS_WITHOUT_PURCHASE"
  | "PASS_NOT_INVITED"
  | "PASS_NOT_EVIDENCED"
  | "PASS_ALTERNATIVE_NOT_CONSIDERED"
  | "REJECT_ON_COMPLETENESS_NOT_PERMITTED"
  | "REJECT_WITHOUT_GROUND"
  | "REASON_REQUIRED";

const PASS_REFUSAL: Record<Ground, VerdictFault> = {
  INCOMPLETE: "PASS_WITH_MISSING_DOCUMENT",
  NOT_PURCHASED: "PASS_WITHOUT_PURCHASE",
  NOT_INVITED: "PASS_NOT_INVITED",
  NOT_EVIDENCED: "PASS_NOT_EVIDENCED",
  ALTERNATIVE_NOT_CONSIDERED: "PASS_ALTERNATIVE_NOT_CONSIDERED",
};

export function verdictFaults(i: { state: OpeningState; sameOpening: boolean; bid: BidForVerdict; checklist: OpeningChecklist; answers: ReadonlyMap<string, ChecklistAnswer>; policy: VerdictPolicy; verdict: OpeningVerdict | null; reason: string }): Finding<VerdictFault>[] {
  const out: Finding<VerdictFault>[] = [...actFaults(i.state)];
  if (!i.sameOpening) out.push({ code: "NOT_THIS_OPENING", level: "block" });
  if (!i.verdict) return [...out, { code: "VERDICT_REQUIRED", level: "block" }];
  const j = judgeBid(i.bid, i.checklist, i.answers, i.policy);
  out.push(...j.notSet);
  if (j.notSet.length) return out;
  if (i.verdict === "PASS") {
    for (const g of j.grounds) out.push({ code: PASS_REFUSAL[g], level: "block", ...(g === "INCOMPLETE" ? { data: { missing: j.missing.map((m) => m.label).join(", ") } } : {}) });
  } else {
    if (j.grounds.length === 0) out.push({ code: j.reported.includes("INCOMPLETE_REPORTED") ? "REJECT_ON_COMPLETENESS_NOT_PERMITTED" : "REJECT_WITHOUT_GROUND", level: "block" });
    if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  }
  return out;
}

/// What is frozen on the bid with its verdict: the items missing, the grounds and what is reported, in keys.
export const verdictRecord = (j: ReturnType<typeof judgeBid>) => ({ missing: j.missing.map((m) => ({ key: m.key, label: m.label })), grounds: j.grounds, reported: j.reported });
