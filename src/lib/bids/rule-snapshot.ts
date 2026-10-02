/**
 * The method's three bid-receipt rules as an exercise is judged by them (6.6 code review CR-2):
 * the committee that decides late admission, the fewest bids expected and what follows from an
 * incomplete bid, each with its provenance. They are frozen into the window's `policySnapshot` at
 * publication, under `bidRules`, and a published exercise reads them from there — never from
 * today's `SourcingMethod`, so a later change to the method changes nothing for an exercise
 * already advertised or invited. Before publication the live method is read.
 *
 * A published window whose snapshot does not record a rule reads it as not set, and says it was
 * not recorded when the window was published (the 6.5 `mandatoryPermittedFor` precedent). There is
 * no fall-back to today's configuration and no exit: a later setting never applies to it.
 */

import type { Provenance } from "@/lib/reference/types";

/// The key the three rules are frozen under in the window's policy snapshot.
export const BID_RULES_KEY = "bidRules";

/// What the register's rules read about the method: the late-admission committee, the minimum, the completeness consequence.
export interface BidMethodRule {
  nameEn: string;
  lateAdmissionCommitteeCode: string | null;
  lateAdmissionProvenance: Provenance | null;
  minimumBids: number | null;
  minimumBidsProvenance: Provenance | null;
  completenessEliminates: boolean | null;
  completenessProvenance: Provenance | null;
}

/// The three rules as frozen at publication, each with its provenance.
export interface FrozenBidRules {
  lateAdmissionCommitteeCode: string | null;
  lateAdmissionProvenance: Provenance | null;
  minimumBids: number | null;
  minimumBidsProvenance: Provenance | null;
  completenessEliminates: boolean | null;
  completenessProvenance: Provenance | null;
}

/// Where a rule's value came from for this exercise.
export type RuleSource =
  /// The window is not published: today's method.
  | "LIVE"
  /// Frozen at publication, as the method stood then (set or not set).
  | "AS_PUBLISHED"
  /// Published, but the snapshot does not record the rule: read as not set.
  | "NOT_RECORDED";

export interface BidRuleReading {
  rule: BidMethodRule | null;
  committee: RuleSource;
  minimum: RuleSource;
  completeness: RuleSource;
  /// True once the window is published: the rules no longer follow configuration.
  frozen: boolean;
}

/// What publication freezes: the method's three rules as they stand, or every one not set where the exercise names no method.
export function bidRulesSnapshot(rule: BidMethodRule | null): FrozenBidRules {
  return {
    lateAdmissionCommitteeCode: rule?.lateAdmissionCommitteeCode ?? null,
    lateAdmissionProvenance: rule?.lateAdmissionProvenance ?? null,
    minimumBids: rule?.minimumBids ?? null,
    minimumBidsProvenance: rule?.minimumBidsProvenance ?? null,
    completenessEliminates: rule?.completenessEliminates ?? null,
    completenessProvenance: rule?.completenessProvenance ?? null,
  };
}

const PROVENANCES: readonly string[] = ["STATED", "OBSERVED", "ASSUMED"];
const provenanceOf = (v: unknown): Provenance | null => (typeof v === "string" && PROVENANCES.includes(v) ? (v as Provenance) : null);
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The rules this exercise is judged by. Unpublished: `live`, as it stands. Published: the
 * snapshot's `bidRules`, each rule read only if its value is recorded and well-formed; one that is
 * not reads as not set (`NOT_RECORDED`). `live` is never consulted once the window is published,
 * except for the method's name, which is a label and not a rule.
 */
export function bidRuleFor(window: { publishedAt: Date | null; policySnapshot: unknown } | null, live: BidMethodRule | null): BidRuleReading {
  if (!window?.publishedAt) return { rule: live, committee: "LIVE", minimum: "LIVE", completeness: "LIVE", frozen: false };
  const raw = (window.policySnapshot as Record<string, unknown> | null)?.[BID_RULES_KEY];
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

  const code = b && has(b, "lateAdmissionCommitteeCode") ? b.lateAdmissionCommitteeCode : undefined;
  const committeeOk = code === null || (typeof code === "string" && code !== "");
  const min = b && has(b, "minimumBids") ? b.minimumBids : undefined;
  const minimumOk = min === null || (typeof min === "number" && Number.isInteger(min) && min >= 1);
  const elim = b && has(b, "completenessEliminates") ? b.completenessEliminates : undefined;
  const completenessOk = elim === null || elim === true || elim === false;

  return {
    rule: {
      nameEn: live?.nameEn ?? "",
      lateAdmissionCommitteeCode: committeeOk ? (code as string | null) : null,
      lateAdmissionProvenance: committeeOk && code !== null ? provenanceOf(b!.lateAdmissionProvenance) : null,
      minimumBids: minimumOk ? (min as number | null) : null,
      minimumBidsProvenance: minimumOk && min !== null ? provenanceOf(b!.minimumBidsProvenance) : null,
      completenessEliminates: completenessOk ? (elim as boolean | null) : null,
      completenessProvenance: completenessOk && elim !== null ? provenanceOf(b!.completenessProvenance) : null,
    },
    committee: committeeOk ? "AS_PUBLISHED" : "NOT_RECORDED",
    minimum: minimumOk ? "AS_PUBLISHED" : "NOT_RECORDED",
    completeness: completenessOk ? "AS_PUBLISHED" : "NOT_RECORDED",
    frozen: true,
  };
}

/// What a frozen rule that reads as not set says on screen: never "set it" — a later setting does not apply.
export function frozenUnsetText(source: RuleSource): string | null {
  if (source === "NOT_RECORDED") return "Not recorded when the window was published, so it reads as not set; a later setting does not apply to this exercise";
  if (source === "AS_PUBLISHED") return "Not set when the window was published; a later setting does not apply to this exercise";
  return null;
}
