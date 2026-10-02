/**
 * What changed between two versions of a row.
 *
 * Pure. The audit trail is only worth keeping if it records the change rather than
 * the whole row: a diff of forty unchanged fields buries the one that moved.
 */

import { END_DAY_LABEL } from "@/lib/effective-text";

export interface FieldChange {
  field: string;
  /// Rendered as text, because the trail must stay legible after the column's type
  /// changes and after the row it describes is gone.
  before: string | null;
  after: string | null;
}

/// How a value reads in the trail. Null and empty are distinguished: clearing a field
/// and never setting it are different acts.
export function renderValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  return String(value);
}

/**
 * Compare two records field by field.
 *
 * Only fields present in `after` are considered, so a partial update does not read as
 * having cleared everything it did not mention.
 */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of Object.keys(after)) {
    const b = renderValue(before ? before[field] : null);
    const a = renderValue(after[field]);
    if (b === a) continue;
    changes.push({ field, before: b, after: a });
  }

  return changes;
}

/// The whole row, for a deletion — there is no "after" to diff against.
export function snapshotFields(row: Record<string, unknown>): FieldChange[] {
  return Object.keys(row).map((field) => ({
    field,
    before: renderValue(row[field]),
    after: null,
  }));
}

/// Fields whose generic reading would say what is stored rather than what it means.
const NAMED_FIELDS: Record<string, string> = {
  // 65-C1: an effective-dated end day is exclusive (inForceOn); History says so as the forms do.
  effectiveTo: END_DAY_LABEL,
  endsOn: END_DAY_LABEL,
  tabledByPersonId: "Tabled by",
  standingInForSeatId: "Standing in for",
  dependsOnDecisionId: "Depends on",
  notApprovedOutcomeId: "Outcome if not carried",
  // An approving office's row and a step's office, as the screens print them.
  approverCode: "Approved by",
  // Scope and estimate policy: an office or list is named, never coded.
  bqPreparerQualificationCode: "Qualification a bill's preparer holds",
  estimateLeadDays: "Estimate made this many days before closing",
  estimateCustodianRoleCode: "Office holding the estimate's copies",
  estimateAuditRoleCode: "Office auditing the estimate",
  estimateOverrideRoleCode: "Office that may accept a late estimate",
  panelSignatoryLimit: "Most verifiers on a specification panel",
  panelContractKindTaxonomyCode: "List of contract kinds",
  panelProjectStatusTaxonomyCode: "List of project statuses",
  requiresCompanyEstimate: "Needs a company estimate",
  requiresBq: "Let on a bill of quantities",
  // A method's scope-approval rule (OD-9), with the act it is decided under (overrides BD-62-16).
  scopeApprovalRequired: "Scope approved by a committee",
  scopeCommitteeCode: "Committee that approves the scope",
  scopeAct: "Committee's act on the scope",
  // 6.6: a method's bid-receipt rules.
  lateAdmissionCommitteeCode: "Committee that decides late admission",
  minimumBids: "Fewest bids expected",
  completenessEliminates: "An incomplete bid is eliminated",
  orgUnitCode: "Unit whose officer verifies",
  qualificationCode: "Qualification",
  deliverableKind: "What the contract delivers",
  roleCode: "Office",
  // Core routing (FR-APR-004): the rule editor's own words.
  generateCoreChain: "Chain from core routing",
  coreChainReason: "Why the chain is as entered",
  // A sitting's matter: the agenda's own words.
  domain: "Matter type",
  matterKind: "Kind of matter",
  sequence: "Place on the agenda",
  // A rate and the unit it is charged per read as one thing.
  ladUnit: "Liquidated damages charged",
  completionUnit: "Completion period counted in",
};

/// Field names are configuration-ish keys; screens render labels. A reference to a
/// record reads as what it points at — "Decided by person", never "… person id": the
/// screen shows the record's name in the value, so the label never mentions an id.
export function fieldLabel(field: string): string {
  if (NAMED_FIELDS[field]) return NAMED_FIELDS[field];
  // The bilingual pairs read as the forms print them: "Name (EN)", "Name (BM)".
  const lang = /En$/.test(field) ? " (EN)" : /Ms$/.test(field) ? " (BM)" : "";
  if (lang) return fieldLabel(field.slice(0, -2)) + lang;
  // Where a rule's value came from (STATED, OBSERVED, ASSUMED): "Voting rule provenance"
  // reads as what it is, not as the column's name.
  const source = /^(.+)Provenance$/.exec(field);
  if (source) return `Where the ${fieldLabel(source[1]).toLowerCase()} comes from`;
  if (field === "provenance") return "Where it comes from";
  const ref = /^(.+[a-z0-9])Id(s?)$/.exec(field);
  if (ref) return fieldLabel(ref[1]) + ref[2];
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A period and the unit it is counted in are one fact: "Completion period: 18 months",
 * not "Completion period: 18" over "Counted in: Months". Where a change set holds both,
 * the unit's change is folded into the period's reading; where only one moved, there is
 * nothing to fold and both stay as they are.
 */
export function foldPeriodChanges<C extends { field: string; before: string | null; after: string | null }>(
  changes: C[],
): C[] {
  const period = changes.find((c) => c.field === "completionPeriod");
  const unit = changes.find((c) => c.field === "completionUnit");
  if (!period || !unit) return changes;
  const say = (n: string | null, u: string | null) =>
    n == null || n === "" ? n : `${n}${u ? ` ${u.toLowerCase()}` : ""}`;
  const folded = { ...period, before: say(period.before, unit.before ?? unit.after), after: say(period.after, unit.after ?? unit.before) };
  return changes.filter((c) => c !== unit).map((c) => (c === period ? folded : c));
}
