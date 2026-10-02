/**
 * FR-BID-007 (R12, D10; OD-8): the mandatory-documents checklist. It lists the parts the approved
 * tender pack marks mandatory (6.4's composition, the declaration and authorisation included) and
 * every addendum issued (6.5). `completeness` says what is missing and never rejects: it is applied
 * to each bid at opening (6.7). What follows from a missing document is the method's configuration
 * (`completenessEliminates`): eliminated, or reported to the committee; null is not set, and 6.7
 * cannot finalise an opening until it is. Pure.
 */

import type { Finding } from "./types";

export interface ChecklistItem {
  /// A key the opening records presence against: the part's code, or "addendum:<n>".
  key: string;
  label: string;
  source: "PART" | "ADDENDUM";
}

/**
 * The checklist: the approved pack's parts marked mandatory, in print order, then addenda 1..n.
 * A part whose mandatory answer is not set is listed with `notSet` (the pack would not have been
 * approved with one, so it is said rather than guessed).
 */
export function checklistFor(i: {
  parts: readonly { partCode: string; label: string; mandatory: boolean | null; sortOrder: number }[];
  addenda: readonly { number: number; title: string }[];
}): { items: ChecklistItem[]; notSet: string[] } {
  const parts = [...i.parts].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    items: [
      ...parts.filter((p) => p.mandatory === true).map((p) => ({ key: p.partCode, label: p.label, source: "PART" as const })),
      ...[...i.addenda].sort((a, b) => a.number - b.number).map((a) => ({ key: `addendum:${a.number}`, label: `Addendum ${a.number}: ${a.title}`, source: "ADDENDUM" as const })),
    ],
    notSet: parts.filter((p) => p.mandatory == null).map((p) => p.label),
  };
}

/// What a bid presented against the checklist: complete, or the items missing. A report, never a rejection.
export function completeness(items: readonly ChecklistItem[], presented: ReadonlySet<string>): { complete: boolean; missing: ChecklistItem[] } {
  const missing = items.filter((i) => !presented.has(i.key));
  return { complete: missing.length === 0, missing };
}

export type CompletenessConsequence = "ELIMINATED" | "REPORTED" | "CONSEQUENCE_NOT_SET";

/// What follows from an incomplete bid, by the method's configuration.
export function completenessConsequence(eliminates: boolean | null): CompletenessConsequence {
  return eliminates == null ? "CONSEQUENCE_NOT_SET" : eliminates ? "ELIMINATED" : "REPORTED";
}

/// 6.7's finalising refuses while the consequence is not set (OD-8).
export function consequenceFault(eliminates: boolean | null): Finding<"CONSEQUENCE_NOT_SET"> | null {
  return eliminates == null ? { code: "CONSEQUENCE_NOT_SET", level: "block" } : null;
}
