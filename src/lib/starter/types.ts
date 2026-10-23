/**
 * The shape of a starter pack (ADR 0043 D1). A pack is data, loaded on purpose by `scripts/load-pack.ts`, never a literal in product code.
 */
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
}

/// One list: loaded only into an empty list (ADR 0043 D1).
export interface PackList {
  model: string; // e.g. "Committee", "SupplierListValue"
  label: string; // the list in words, the start of each row's audit entityLabel, e.g. "State"
  scope?: Record<string, unknown>; // narrows "the list", e.g. { list: "STATE" }
  /// `label`: the row in words, where its table has no `nameEn` or `name` (the audit row never shows the code).
  rows: Array<{ code: string; label?: string; values: Record<string, unknown>; source: string; requirement?: string }>;
}

export interface StarterPack {
  name: PackName;
  version: number; // in the SYSTEM actor label: "Starter pack: RSAJ v1"
  provenance: PackProvenance;
  groups: PackGroup[];
  lists: PackList[]; // in dependency order: a list another refers to comes first
  drafts?: { matrices?: unknown[]; evaluationModels?: unknown[] }; // RSAJ only; typed in 4.4 from the matrix and model writers' inputs
  setsTwoPersonOff?: "WHEN_CREATING_ROW" | "DEMO_DATABASE_ONLY"; // generic | dev-fill (the only exception to SP-23)
}

export type PackSkip = { target: string; reason: "GROUP_PARTLY_SET" | "GROUP_SET" | "LIST_NOT_EMPTY" | "REFERENCE_SKIPPED" | "DRAFT_EXISTS" };
export interface PackPlan {
  writes: unknown[];
  skips: PackSkip[];
  faults: string[];
}
