/**
 * The shape of a starter pack (ADR 0043 D1). A pack is data, loaded on purpose by `scripts/load-pack.ts`, never a literal in product code.
 */

import type { CoreLevel, Policy, Rule } from "@/lib/authority/types";
import type { ModelContent } from "@/lib/evaluation/model";

export type PackName = "generic" | "rsaj" | "dev-fill";
export type PackProvenance = "STATED" | "ASSUMED";

/// One scalar group: the columns that share one provenance column. Written only when every column is null (ADR 0043 D1).
export interface PackGroup {
  model: string; // Prisma model name, e.g. "WindowPolicy"
  label: string; // the audit row's entityLabel, e.g. "Invitation · date rules"
  values: Record<string, unknown>; // column -> value; references as { ref: "<list>:<code>" }
  provenanceColumn?: string; // e.g. "dateRulesProvenance"; absent where the table has none
  sourceColumn?: string; // e.g. "dateRuleSource"
  source: string; // the clause, or "generic starting value"
  requirement?: string; // RSAJ requirement ID(s), e.g. "FR-ADV-004, FR-ADV-006"; RSAJ pack only
  /// One existing row of a list table, by its literal id, instead of the organisation's one row: the development fill only (its demo rows). The row must be this
  /// organisation's; it is filled only where every column is unset, and never created.
  rowId?: string;
}

/// One list: loaded only into an empty list (ADR 0043 D1).
export interface PackList {
  model: string; // e.g. "Committee", "SupplierListValue"
  label: string; // the list in words, the start of each row's audit entityLabel, e.g. "State"
  scope?: Record<string, unknown>; // narrows "the list", e.g. { list: "STATE" }
  /// `label`: the row in words, where its table has no `nameEn` or `name` (the audit row never shows the code).
  rows: Array<{ code: string; label?: string; values: Record<string, unknown>; source: string; requirement?: string }>;
}

/// One rule of a draft approval matrix, as the resolver reads it, with where it comes from: ASSUMED where the rule is a reading of the source
/// rather than its words (the slashed DAL codes, SP-2a). The table has no provenance column; it is kept in the rule's note and its audit row.
export type PackRule = Rule & { provenance: PackProvenance; source: string; requirement?: string };

/**
 * A draft approval matrix (ADR 0043 D2): never in force. It has no issue date, no issuer and no maker, so a person adopts it and puts it in force
 * through the normal issue path. Its offices are the AuthorityRole rows of the same run.
 */
export interface PackMatrixDraft {
  label: string;
  policy: Omit<Policy, "clauses">;
  /// Where the ruling on a value exactly at the boundary comes from (AuthorityMatrix.boundaryProvenance); absent: ASSUMED, the column's default.
  boundaryProvenance?: "STATED" | "OBSERVED" | "ASSUMED";
  boundarySource?: string;
  coreRouting: CoreLevel[];
  rules: PackRule[];
  /// The contract terms bands (FR-MTD-001): which terms set applies at a value, never the retention or defects figures.
  termsBands?: PackTermsBand[];
  source: string;
  requirement?: string;
}
export interface PackTermsBand {
  bandKey: string;
  regime: "below" | "quotation" | "tender" | null;
  minValue: number | null;
  maxValue: number | null;
  labelEn: string;
  retentionApplies: boolean | null;
  defectsLiabilityApplies: boolean | null;
  followsBoundarySwitch: boolean | null;
  clause: string;
  provenance: PackProvenance;
}

/// A draft evaluation model (ADR 0043 D2): status DRAFT, version 1, no issuer and no maker. Its content carries its own provenance.
export interface PackModelDraft {
  content: Omit<ModelContent, "version">;
  notes?: string;
  source: string;
  requirement?: string;
}

export interface StarterPack {
  name: PackName;
  version: number; // in the SYSTEM actor label: "Starter pack: RSAJ v1"
  provenance: PackProvenance;
  groups: PackGroup[];
  lists: PackList[]; // in dependency order: a list another refers to comes first
  drafts?: { matrices?: PackMatrixDraft[]; evaluationModels?: PackModelDraft[] }; // RSAJ only (ADR 0043 D2)
  setsTwoPersonOff?: "WHEN_CREATING_ROW" | "DEMO_DATABASE_ONLY"; // generic | dev-fill (the only exception to SP-23)
}

export type PackSkip = { target: string; reason: "GROUP_PARTLY_SET" | "GROUP_SET" | "LIST_NOT_EMPTY" | "REFERENCE_SKIPPED" | "DRAFT_EXISTS" };
export interface PackPlan {
  writes: unknown[];
  skips: PackSkip[];
  faults: string[];
}
