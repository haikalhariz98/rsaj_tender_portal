/**
 * The rules an opening freezes at its start (its policySnapshot), read back defensively: null where
 * not recorded, never today's configuration (6.6 CR-2 precedent). Pure.
 */

import type { Provenance } from "@/lib/reference/types";

import type { InvitedCountReading, UnpurchasedConsequence } from "./types";

/// The rules a policy snapshot froze at start, read back defensively (null where not recorded).
export interface OpeningPolicySnapshot {
  committee: { code: string | null; name: string | null; provenance: Provenance | null };
  panel: { size: number | null; sizeProvenance: Provenance | null; exclusionRule: boolean | null; excludedUnitCode: string | null; exclusionProvenance: Provenance | null };
  completeness: { eliminates: boolean | null; provenance: Provenance | null; source: string };
  /// recordedLater: set on the method after the start, recorded on the opening when first needed (OD-4), at recordedAt (ISO) by recordedBy (S-3).
  unpurchased: { consequence: UnpurchasedConsequence | null; provenance: Provenance | null; recordedLater?: boolean; recordedAt?: string; recordedBy?: string };
  minimumBids: { value: number | null; provenance: Provenance | null };
  alternativesPermitted: boolean | null;
  restrictedTender: boolean | null;
  path: "ADVERTISED" | "INVITED";
  estimate: { requires: boolean | null; provenance: Provenance | null };
  /// Review R-4: how the schedule counts the tenderers invited (OD-9), frozen at the start. Absent on an opening started before: not recorded, read as not set (never today's configuration).
  invited: { reading: InvitedCountReading | null; provenance: Provenance | null };
  /// Review R-4: the Grand Summary's words, frozen at the start (unset: the product's words, FR-OPN-010).
  summaryLabels: { qualifiedEn: string | null; notQualifiedEn: string | null; lowestEn: string | null; qualifiedMs: string | null; notQualifiedMs: string | null; lowestMs: string | null; provenance: Provenance | null };
}

export function policyOf(raw: unknown): OpeningPolicySnapshot {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Partial<OpeningPolicySnapshot>;
  return {
    committee: o.committee ?? { code: null, name: null, provenance: null },
    panel: o.panel ?? { size: null, sizeProvenance: null, exclusionRule: null, excludedUnitCode: null, exclusionProvenance: null },
    completeness: o.completeness ?? { eliminates: null, provenance: null, source: "NOT_RECORDED" },
    unpurchased: o.unpurchased ?? { consequence: null, provenance: null },
    minimumBids: o.minimumBids ?? { value: null, provenance: null },
    alternativesPermitted: o.alternativesPermitted ?? null,
    restrictedTender: o.restrictedTender ?? null,
    path: o.path ?? "ADVERTISED",
    estimate: o.estimate ?? { requires: null, provenance: null },
    invited: o.invited ?? { reading: null, provenance: null },
    summaryLabels: o.summaryLabels ?? { qualifiedEn: null, notQualifiedEn: null, lowestEn: null, qualifiedMs: null, notQualifiedMs: null, lowestMs: null, provenance: null },
  };
}

/// Review R-4: the opening policy's two readings as frozen on an opening at its start.
export const openingPolicyFrozen = (p: { invitedCountReading: InvitedCountReading | null; invitedCountProvenance: string | null; qualifiedLabelEn: string | null; notQualifiedLabelEn: string | null; lowestLabelEn: string | null; qualifiedLabelMs: string | null; notQualifiedLabelMs: string | null; lowestLabelMs: string | null; labelsProvenance: string | null } | null): Pick<OpeningPolicySnapshot, "invited" | "summaryLabels"> => ({
  invited: { reading: p?.invitedCountReading ?? null, provenance: (p?.invitedCountProvenance as Provenance | null) ?? null },
  summaryLabels: { qualifiedEn: p?.qualifiedLabelEn ?? null, notQualifiedEn: p?.notQualifiedLabelEn ?? null, lowestEn: p?.lowestLabelEn ?? null, qualifiedMs: p?.qualifiedLabelMs ?? null, notQualifiedMs: p?.notQualifiedLabelMs ?? null, lowestMs: p?.lowestLabelMs ?? null, provenance: (p?.labelsProvenance as Provenance | null) ?? null },
});

/// The Grand Summary's English words as frozen on the opening (the screen's words, BD-67-22).
export const summaryLabelsOf = (s: OpeningPolicySnapshot) => ({ qualified: s.summaryLabels.qualifiedEn, notQualified: s.summaryLabels.notQualifiedEn, lowest: s.summaryLabels.lowestEn });
