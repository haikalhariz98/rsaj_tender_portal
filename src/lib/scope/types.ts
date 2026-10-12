/**
 * The vocabulary of 6.2: scope, the bill of quantities, the specification panel and the
 * company estimate (plan docs/notes/plans/6.2-scope-bq-estimate.md, ADR 0012).
 *
 * Mirrors the Prisma enums so `src/lib/scope/**` stays free of the client, as the other
 * lib modules do. Every rule lives beside this file; actions and screens call it and never
 * restate it. Money is sen (bigint); a quantity is a decimal string to three places.
 */

import type { Sen } from "@/lib/money";
import type { Provenance } from "@/lib/reference/types";

export type { Provenance, Sen };

export type BqStatus = "DRAFT" | "FINALISED" | "SUPERSEDED";
export type BqScopedBy = "IMPLEMENTING_DEPARTMENT" | "SPECIALIST_CONTRACTOR" | "COORDINATION_MEETING";
export const BQ_SCOPED_BY: readonly BqScopedBy[] = ["IMPLEMENTING_DEPARTMENT", "SPECIALIST_CONTRACTOR", "COORDINATION_MEETING"];
export type BqItemKind = "MEASURED" | "PRIME_COST_SUM" | "PROVISIONAL_SUM";
export const BQ_ITEM_KINDS: readonly BqItemKind[] = ["MEASURED", "PRIME_COST_SUM", "PROVISIONAL_SUM"];
export type BqRateSource = "ENTERED" | "SCHEDULE";
export type PanelStatus = "DRAFT" | "VERIFIED";
export type EstimateState = "DRAFT" | "LODGED" | "DISCLOSED" | "VOID";
export type EstimateEventKind = "PREPARED" | "AMENDED" | "LODGED" | "RETAINED" | "LATE_OVERRIDE" | "DISCLOSED" | "VOIDED";

export type Level = "block" | "warn" | "info";

/// A rule's finding: a code (rendered by labels.ts, never shown), how much it matters, and
/// the values its words are written with. Never a sealed figure or an amendment reason.
export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  data?: Record<string, string | number | null>;
}

export const blocking = <C extends string>(fs: readonly Finding<C>[]) => fs.filter((f) => f.level === "block");

/// The organisation's scope and estimate rules (ScopePolicy). Every field unset is null.
export interface ScopePolicy {
  /// SR-08, SR-09 (rulings 12 and 13, G2): whether the specification panel is used, and whether the bill is built on screen. Null: not set.
  specPanelUsed: boolean | null;
  onScreenBillUsed: boolean | null;
  measurementStandardLabel: string | null;
  measurementStandardProvenance: Provenance | null;
  bqPreparerQualificationCode: string | null;
  estimateLeadDays: number | null;
  estimateLeadProvenance: Provenance | null;
  estimateCustodianRoleCode: string | null;
  estimateAuditRoleCode: string | null;
  estimateOverrideRoleCode: string | null;
  panelSignatoryLimit: number | null;
  panelSignatoryLimitProvenance: Provenance | null;
  panelContractKindTaxonomyCode: string | null;
  panelProjectStatusTaxonomyCode: string | null;
  benchmarkLabelEn: string | null;
  benchmarkLabelMs: string | null;
}

/// No row, or a row with nothing set: the same, and nothing is assumed.
export const UNSET_SCOPE_POLICY: ScopePolicy = {
  specPanelUsed: null,
  onScreenBillUsed: null,
  measurementStandardLabel: null,
  measurementStandardProvenance: null,
  bqPreparerQualificationCode: null,
  estimateLeadDays: null,
  estimateLeadProvenance: null,
  estimateCustodianRoleCode: null,
  estimateAuditRoleCode: null,
  estimateOverrideRoleCode: null,
  panelSignatoryLimit: null,
  panelSignatoryLimitProvenance: null,
  panelContractKindTaxonomyCode: null,
  panelProjectStatusTaxonomyCode: null,
  benchmarkLabelEn: null,
  benchmarkLabelMs: null,
};

/// One line of a bill as the rules read it. `quantity` is a decimal string (three places at
/// most); `rate` is sen. Either may be missing while the bill is a draft.
export interface BqLine {
  itemRef: string;
  description: string;
  unit: string;
  kind: BqItemKind;
  quantity: string | null;
  rate: Sen | null;
  provisional: boolean;
}

/// A person's holding of a qualification, days as YYYY-MM-DD; `validTo` inclusive, null open-ended.
export interface QualificationHolding {
  personId: string;
  qualificationCode: string;
  validFrom: string;
  validTo: string | null;
}

/// A configured qualification.
export interface QualificationRow {
  code: string;
  nameEn: string;
  retiredOn: string | null;
}
