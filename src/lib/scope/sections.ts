/**
 * Which of the Scope and estimate tab's sections an exercise needs (founder decision,
 * 2026-10-05: show only the sub-tabs this exercise needs). Pure.
 *
 * Scope is always there. The bill of quantities is there when the contract basis is let on a
 * bill, and the company estimate when the sourcing method asks for one. A rule nobody has
 * configured yet is not "no": the section stays, and says what is missing. So does a section
 * that already holds a bill or an estimate, so recorded work is never stranded behind a rule
 * changed later. The ids are the ones deep links use.
 */

export type ScopeSectionId = "details" | "dates" | "officers" | "notice" | "briefing" | "scope" | "bq" | "estimate";

export const SCOPE_SECTION_LABEL: Readonly<Record<ScopeSectionId, string>> = {
  details: "Details & compliance",
  dates: "Key dates & person in charge",
  officers: "Opening officers",
  notice: "Notice and fee",
  briefing: "Briefing and site visit",
  scope: "Scope",
  bq: "Bill of quantities",
  estimate: "Company estimate",
};

/**
 * Sourcing Requirements v2, rulings 8, 9 and 11: Details & compliance; Key dates & person in charge; Opening officers; Notice and fee;
 * Briefing and site visit; then the scope and bill the section already held, and the Company estimate as its own section (answer 2).
 * The scope and the bill are removed or changed by SR-08 and SR-09, which this order leaves alone.
 */
const ORDER: readonly ScopeSectionId[] = ["details", "dates", "officers", "notice", "briefing", "scope", "bq", "estimate"];

/// The sections that exist only where the exercise issues tender or quotation documents: its dates, its bids' opening officers, its notice and its briefing.
const TENDERED_ONLY: ReadonlySet<ScopeSectionId> = new Set<ScopeSectionId>(["dates", "officers", "notice", "briefing"]);

export interface ScopeSectionFacts {
  /// The basis's answer; null when it is not set or no basis is chosen yet.
  requiresBq: boolean | null;
  /// The method's answer; null when it is not set.
  requiresCompanyEstimate: boolean | null;
  hasBill: boolean;
  hasEstimate: boolean;
  /// Whether the exercise issues tender or quotation documents (so has dates to propose, bids to open, a notice and briefings). Null: not known, and nothing is hidden on a guess.
  tendered?: boolean | null;
}

/// Every section, for a tab that is not being looked at (nothing is rendered from it).
export const ALL_SCOPE_SECTIONS: readonly { id: ScopeSectionId; label: string }[] = ORDER.map((id) => ({ id, label: SCOPE_SECTION_LABEL[id] }));

export function visibleScopeSections(f: ScopeSectionFacts | null): { id: ScopeSectionId; label: string }[] {
  // Nothing known: show everything rather than hide a section on a guess.
  const ids = ORDER.filter((id) => (id === "bq" ? f == null || f.requiresBq !== false || f.hasBill : id === "estimate" ? f == null || f.requiresCompanyEstimate !== false || f.hasEstimate : TENDERED_ONLY.has(id) ? f?.tendered !== false : true));
  return ids.map((id) => ({ id, label: SCOPE_SECTION_LABEL[id] }));
}

/// The section the address names, or the first one visible when it names a hidden or unknown one.
export function scopeSectionOf(asked: string | undefined, visible: readonly { id: ScopeSectionId }[]): ScopeSectionId {
  return visible.find((s) => s.id === asked)?.id ?? visible[0]?.id ?? "details";
}
