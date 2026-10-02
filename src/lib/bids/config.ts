/**
 * A sourcing method's bid-receipt rules (OD-5, OD-8, B7), as Configuration › Invitation saves them:
 * the committee that decides late admission, the fewest bids the method expects, and whether an
 * incomplete bid is eliminated or reported. Each is nullable — not set is never a default, and
 * says what it holds back — and each says where it came from once set. Pure.
 */

import type { Finding, Level } from "./types";

export type BidRuleFault = "UNKNOWN_COMMITTEE" | "MINIMUM_BELOW_ONE" | "PROVENANCE_REQUIRED";

export interface BidRuleDraft {
  committeeCode: string | null;
  committeeProvenance: string | null;
  minimumBids: number | null;
  minimumProvenance: string | null;
  eliminates: boolean | null;
  eliminatesProvenance: string | null;
}

export function bidRuleFaults(d: BidRuleDraft, known: { committees: readonly string[] }): (Finding<BidRuleFault> & { field: string })[] {
  const out: (Finding<BidRuleFault> & { field: string })[] = [];
  const f = (code: BidRuleFault, field: string, level: Level = "block") => out.push({ code, level, field });
  if (d.committeeCode != null && !known.committees.includes(d.committeeCode)) f("UNKNOWN_COMMITTEE", "lateAdmissionCommitteeCode");
  if (d.committeeCode != null && !d.committeeProvenance) f("PROVENANCE_REQUIRED", "lateAdmissionProvenance");
  if (d.minimumBids != null && d.minimumBids < 1) f("MINIMUM_BELOW_ONE", "minimumBids");
  if (d.minimumBids != null && !d.minimumProvenance) f("PROVENANCE_REQUIRED", "minimumBidsProvenance");
  if (d.eliminates != null && !d.eliminatesProvenance) f("PROVENANCE_REQUIRED", "completenessProvenance");
  return out;
}

/// What is stored: an unset value carries no provenance.
export function bidRuleToSave(d: BidRuleDraft) {
  return {
    lateAdmissionCommitteeCode: d.committeeCode,
    lateAdmissionProvenance: d.committeeCode == null ? null : d.committeeProvenance,
    minimumBids: d.minimumBids,
    minimumBidsProvenance: d.minimumBids == null ? null : d.minimumProvenance,
    completenessEliminates: d.eliminates,
    completenessProvenance: d.eliminates == null ? null : d.eliminatesProvenance,
  };
}

export const BID_RULE_FAULT_TEXT: Readonly<Record<BidRuleFault, string>> = {
  UNKNOWN_COMMITTEE: "That committee is not configured. Choose one from Configuration, Committees.",
  MINIMUM_BELOW_ONE: "The fewest bids is at least one.",
  PROVENANCE_REQUIRED: "Say where this came from.",
};

/// When a change to a method's bid-receipt rules applies (6.6 CR-2): publication freezes them with the window.
export const BID_RULES_APPLY_TEXT = "A change applies only to exercises published after it: an exercise already advertised or invited keeps the rules frozen with its window.";

/// What each setting holds back while it is not set, said beside "Not set".
export const BID_RULE_UNSET = {
  committee: "No late envelope can be tabled for admission, and an award on an exercise with one is held back.",
  minimum: "Whether competition is adequate is not judged; never read as met.",
  eliminates: "An opening cannot be finalised until it is set.",
} as const;
