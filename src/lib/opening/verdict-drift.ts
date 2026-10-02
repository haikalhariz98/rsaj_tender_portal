/**
 * Each recorded verdict judged again just before finalising (6.15a fix R-6, residual 5; flagged against
 * accepted 6.7). The one judgement the finalise act and the opening screen both run, so they cannot drift
 * apart. Two separate findings, each naming what changed:
 *
 * - SETTING: on a bidder the supplier register found not eligible, the register's consequence about to be
 *   frozen treats it otherwise than the verdict did (eliminated against reported): the register's setting
 *   changed since the verdict was recorded (OD-6 A);
 * - NO_LONGER_STANDS: the treatment is the same, but the verdict no longer stands under the grounds the
 *   rules make now — a PASS with a ground against it, or a REJECT with none — for a reason that is not the
 *   register's setting (a sale voided since, the method's unpurchased rule set since…). The grounds added
 *   and removed since the verdict are named.
 *
 * A verdict recorded on a bid with its consequence unset is not judged here (that blocks on its own). Pure.
 */

import { ineligibleOf } from "@/lib/suppliers/opening-hook";

import type { OpeningChecklist } from "./checklist";
import type { ChecklistAnswer, OpeningVerdict, UnpurchasedConsequence } from "./types";
import { judgeBid, recordedTreatment, type BidForVerdict, type Ground, type IneligibleTreatment } from "./verdict";

export interface BidAsRecorded extends Omit<BidForVerdict, "ineligible"> {
  listingNo: number;
  verdict: OpeningVerdict | null;
  /// The record frozen with the verdict (`verdictRecord`).
  completeness: unknown;
  eligibilityFinding: unknown;
  answers: readonly { itemKey: string; answer: ChecklistAnswer }[];
}

export interface VerdictDrift {
  setting: { listingNo: number; was: IneligibleTreatment; now: IneligibleTreatment }[];
  noLongerStands: { listingNo: number; verdict: OpeningVerdict; added: Ground[]; removed: Ground[] }[];
}

const recordedGrounds = (record: unknown): Ground[] => {
  const g = record && typeof record === "object" ? (record as { grounds?: unknown }).grounds : null;
  return Array.isArray(g) ? (g.map(String) as Ground[]) : [];
};

export function verdictDrift(
  bids: readonly BidAsRecorded[],
  ctx: { checklist: OpeningChecklist; completenessEliminates: boolean | null; unpurchased: UnpurchasedConsequence | null; ineligible: UnpurchasedConsequence | null },
): VerdictDrift {
  const out: VerdictDrift = { setting: [], noLongerStands: [] };
  for (const b of bids) {
    if (!b.verdict) continue;
    const facts: BidForVerdict = { saleFinding: b.saleFinding, restrictionFinding: b.restrictionFinding, isAlternative: b.isAlternative, alternativeStatus: b.alternativeStatus, ineligible: ineligibleOf(b.eligibilityFinding) };
    const j = judgeBid(facts, ctx.checklist, new Map(b.answers.map((a) => [a.itemKey, a.answer])), { completenessEliminates: ctx.completenessEliminates, unpurchased: ctx.unpurchased, ineligible: ctx.ineligible });
    if (j.notSet.length) continue;
    const now = j.grounds.includes("NOT_ELIGIBLE") ? "ELIMINATE" : j.reported.includes("NOT_ELIGIBLE_REPORTED") ? "REPORT" : "NONE";
    const was = recordedTreatment(b.completeness);
    if (facts.ineligible && was !== now) {
      out.setting.push({ listingNo: b.listingNo, was, now });
      continue;
    }
    const stands = b.verdict === "PASS" ? j.grounds.length === 0 : j.grounds.length > 0;
    if (stands) continue;
    const before = recordedGrounds(b.completeness);
    out.noLongerStands.push({ listingNo: b.listingNo, verdict: b.verdict, added: j.grounds.filter((g) => !before.includes(g)), removed: before.filter((g) => !j.grounds.includes(g)) });
  }
  return out;
}
