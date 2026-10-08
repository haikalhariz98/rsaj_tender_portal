/**
 * Whether a registered supplier is eligible for an exercise (FR-VND-011 staff view, FR-ADV-010, FR-BID-008
 * on paper, SK001 7.3.4 (a)), condition by condition, each PASS, FAIL with its reason, NOT_ASSESSED with
 * its reason, or PASS_BY_PERMISSION. The verdict is NOT_ELIGIBLE where anything fails, else NOT_ASSESSED
 * where anything is not assessed, and ELIGIBLE only where every condition passes: one NOT_ASSESSED with no
 * FAIL is never ELIGIBLE (AGENTS.md rule 2).
 *
 * The conditions:
 * - registered with the organisation, and in good standing (`standing`; a lapse with its rule unset is
 *   not assessed, never quietly passed);
 * - each registration requirement the exercise states (6.4's `ExerciseRegistrationRequirement`; any one
 *   in an alternative group, every group): the body's registration held across the window (a verified
 *   document of a type tied to the body, `windowValidity`), and its qualifiers. As built, 6.4 states
 *   qualifiers in words only; those read NOT_ASSESSED "stated in words only, not compared" (step 0,
 *   BD-615-1). Where structured needs reach a requirement, a grade is compared by the body's configured
 *   rank (never by a ceiling against the sealed estimate, OD-10), categories and specialisations any-of,
 *   field codes all-of;
 * - a restricted tender's restriction, evidenced by the document type the policy names
 *   (`restrictionEvidenceTypeId`, so no literal), held across the window.
 *
 * A special permission (FR-ADV-017) turns only its own requirement's grade or field-code FAIL into
 * PASS_BY_PERMISSION. Pure.
 */

import { documentInForce } from "./documents";
import type { StandingReading } from "./standing";
import type { DocumentFacts, RegistrationValueKind } from "./types";
import { bestReading, windowValidity, type Assessment, type WindowDays, type WindowReading } from "./window";

export type Result = Assessment | "PASS_BY_PERMISSION";
export type Verdict = "ELIGIBLE" | "NOT_ELIGIBLE" | "NOT_ASSESSED";

export type ConditionKind = "REGISTERED" | "STANDING" | "REGISTRATION" | "GRADE" | "CATEGORY" | "SPECIALISATION" | "FIELD_CODES" | "PERMITS" | "QUALIFIERS" | "RESTRICTION";

export type ConditionReason =
  | WindowReading["reason"]
  | "IS_REGISTERED"
  | "NOT_REGISTERED"
  | "IN_GOOD_STANDING"
  | "BARRED"
  | "LAPSE_RULE_NOT_SET"
  | "NO_DOCUMENT_TYPE_FOR_BODY"
  | "QUALIFIERS_IN_WORDS"
  | "GRADE_MET"
  | "GRADE_BELOW"
  | "GRADE_NOT_HELD"
  | "GRADE_RANK_NOT_SET"
  | "VALUE_HELD"
  | "VALUE_NOT_HELD"
  | "FIELD_CODES_HELD"
  | "FIELD_CODES_MISSING"
  | "PERMITS_HELD"
  | "PERMITS_MISSING"
  | "RESTRICTION_NOT_STATED"
  | "EVIDENCE_TYPE_NOT_SET";

export interface ConditionRow {
  kind: ConditionKind;
  result: Result;
  reason: ConditionReason;
  /// The requirement it belongs to, where it does.
  requirementId: string | null;
  /// Words and days the reason is written with (labels, never codes).
  data?: Record<string, string>;
}

export interface NeededValue {
  code: string;
  label: string;
}

/// What a requirement asks for, where it is structured (Phase 4c, 615-C1: from the requirement's own needs; none for a requirement stated in words only).
export interface StructuredNeeds {
  /// The lowest grade accepted, by its configured rank. A rank of null cannot be compared.
  grade?: { rank: number | null; label: string };
  categories?: readonly NeededValue[];
  specialisations?: readonly NeededValue[];
  fieldCodes?: readonly NeededValue[];
  /// Every one is needed (permit types are not ruled either way; the default taken, logged for the product owner).
  permitTypes?: readonly NeededValue[];
}

/// A stored need as eligibility reads it: what it was entered as (code and name, for display), and the value's rank NOW (read live; null: not set).
export interface StoredNeed {
  kind: string;
  codeSnapshot: string;
  labelSnapshot: string;
  rankNow: number | null;
}

/// A requirement's stored needs as the structured comparison reads them (615-C1). None: the requirement is stated in words only, and stays so.
export function structuredOf(needs: readonly StoredNeed[]): StructuredNeeds | null {
  if (needs.length === 0) return null;
  const of = (k: string): NeededValue[] => needs.filter((n) => n.kind === k).map((n) => ({ code: n.codeSnapshot, label: n.labelSnapshot }));
  const grade = needs.find((n) => n.kind === "GRADE");
  return {
    ...(grade ? { grade: { rank: grade.rankNow, label: grade.labelSnapshot } } : {}),
    categories: of("CATEGORY"),
    specialisations: of("SPECIALISATION"),
    fieldCodes: of("FIELD_CODE"),
    permitTypes: of("PERMIT_TYPE"),
  };
}

export interface RequirementFacts {
  id: string;
  bodyCode: string;
  bodyLabel: string;
  /// The qualifiers as 6.4 states them, in words.
  qualifiers: string;
  alternativeGroup: number;
  structured?: StructuredNeeds | null;
  /// True when `qualifiers` was composed from the structured needs: the words then say nothing more than the needs do.
  qualifiersFromNeeds?: boolean;
}

export interface HeldValue {
  kind: RegistrationValueKind;
  code: string;
  label: string;
  /// A grade's configured rank now. Null: not set, so not comparable.
  rank: number | null;
}

export interface EligibilityInput {
  supplier: { status: string };
  standing: StandingReading;
  requirements: readonly RequirementFacts[];
  /// The document types tied to each registration body, by the body's code.
  typesOfBody: Readonly<Record<string, readonly string[]>>;
  docs: readonly DocumentFacts[];
  /// The values a document records, by document id.
  valuesOf: Readonly<Record<string, readonly HeldValue[]>>;
  window: WindowDays;
  policy: { expiryOnClosingDayCounts: boolean | null; restrictionEvidenceTypeId: string | null };
  /// The exercise's restriction (6.4 `restrictedTender`). Null: not stated.
  restrictedTender: boolean | null;
  /// Special permissions granted to this party, by requirement and what each relaxes.
  permissions: readonly { requirementId: string; relaxes: "GRADE" | "FIELD_CODE" }[];
  /// The day judged (the organisation's day): the values held are the document in force's on it (residual 3).
  on: string;
}

export interface Eligibility {
  verdict: Verdict;
  rows: ConditionRow[];
}

const passes = (r: Result) => r === "PASS" || r === "PASS_BY_PERMISSION";

/// FAIL over NOT_ASSESSED over a pass.
export function combine(results: readonly Result[]): Assessment {
  if (results.some((r) => r === "FAIL")) return "FAIL";
  if (results.some((r) => r === "NOT_ASSESSED")) return "NOT_ASSESSED";
  return "PASS";
}

/// A chain's verified documents in force across the window, as one reading per type, the best of them.
function registrationReading(typeIds: readonly string[], docs: readonly DocumentFacts[], w: WindowDays, policy: EligibilityInput["policy"]) {
  return bestReading(typeIds.map((t) => windowValidity(docs.filter((d) => d.typeId === t), w, policy)));
}

/// The values held on `on`: those the document in force of each of the body's types records (residual 3:
/// a verified upgrade valid only from a later day does not lift a grade before that day; M-3's rule).
function heldValues(typeIds: readonly string[], docs: readonly DocumentFacts[], valuesOf: EligibilityInput["valuesOf"], on: string): HeldValue[] {
  return typeIds.flatMap((t) => {
    const inForce = documentInForce(docs.filter((d) => d.typeId === t), on);
    return inForce && !inForce.notApplicable ? (valuesOf[inForce.id] ?? []) : [];
  });
}

function structuredRows(req: RequirementFacts, held: readonly HeldValue[], permitted: (r: "GRADE" | "FIELD_CODE") => boolean): ConditionRow[] {
  const s = req.structured!;
  const rows: ConditionRow[] = [];
  const row = (kind: ConditionKind, result: Result, reason: ConditionReason, data?: Record<string, string>): ConditionRow => ({ kind, result, reason, requirementId: req.id, ...(data ? { data } : {}) });
  if (s.grade) {
    const grades = held.filter((h) => h.kind === "GRADE");
    if (grades.length === 0) rows.push(row("GRADE", permitted("GRADE") ? "PASS_BY_PERMISSION" : "FAIL", "GRADE_NOT_HELD", { needed: s.grade.label }));
    else if (s.grade.rank == null || grades.some((g) => g.rank == null)) rows.push(row("GRADE", "NOT_ASSESSED", "GRADE_RANK_NOT_SET", { needed: s.grade.label, held: grades.map((g) => g.label).join(", ") }));
    else {
      const best = [...grades].sort((a, b) => b.rank! - a.rank!)[0];
      if (best.rank! >= s.grade.rank) rows.push(row("GRADE", "PASS", "GRADE_MET", { needed: s.grade.label, held: best.label }));
      else rows.push(row("GRADE", permitted("GRADE") ? "PASS_BY_PERMISSION" : "FAIL", "GRADE_BELOW", { needed: s.grade.label, held: best.label }));
    }
  }
  for (const [kind, needed, valueKind] of [["CATEGORY", s.categories, "CATEGORY"], ["SPECIALISATION", s.specialisations, "SPECIALISATION"]] as const) {
    if (!needed?.length) continue;
    const hit = needed.find((n) => held.some((h) => h.kind === valueKind && h.code === n.code));
    rows.push(hit ? row(kind, "PASS", "VALUE_HELD", { held: hit.label }) : row(kind, "FAIL", "VALUE_NOT_HELD", { needed: needed.map((n) => n.label).join(" or ") }));
  }
  if (s.fieldCodes?.length) {
    const missing = s.fieldCodes.filter((n) => !held.some((h) => h.kind === "FIELD_CODE" && h.code === n.code));
    if (missing.length === 0) rows.push(row("FIELD_CODES", "PASS", "FIELD_CODES_HELD"));
    else rows.push(row("FIELD_CODES", permitted("FIELD_CODE") ? "PASS_BY_PERMISSION" : "FAIL", "FIELD_CODES_MISSING", { missing: missing.map((n) => n.label).join(", ") }));
  }
  if (s.permitTypes?.length) {
    const missing = s.permitTypes.filter((n) => !held.some((h) => h.kind === "PERMIT_TYPE" && h.code === n.code));
    if (missing.length === 0) rows.push(row("PERMITS", "PASS", "PERMITS_HELD"));
    else rows.push(row("PERMITS", "FAIL", "PERMITS_MISSING", { missing: missing.map((n) => n.label).join(", ") }));
  }
  return rows;
}

export function eligibility(i: EligibilityInput): Eligibility {
  const rows: ConditionRow[] = [];
  const registered = i.supplier.status === "REGISTERED";
  rows.push({ kind: "REGISTERED", result: registered ? "PASS" : "FAIL", reason: registered ? "IS_REGISTERED" : "NOT_REGISTERED", requirementId: null });
  if (registered) {
    const st = i.standing;
    if (st.standing === "ACTIVE") {
      const unset = st.notes.some((n) => n.code === "LAPSE_RULE_NOT_SET");
      rows.push(unset ? { kind: "STANDING", result: "NOT_ASSESSED", reason: "LAPSE_RULE_NOT_SET", requirementId: null, data: { types: st.lapsed.join(", ") } } : { kind: "STANDING", result: "PASS", reason: "IN_GOOD_STANDING", requirementId: null });
    } else rows.push({ kind: "STANDING", result: "FAIL", reason: "BARRED", requirementId: null, data: { standing: st.standing } });
  }

  // The requirements, by alternative group: any one requirement in a group, every group.
  const groupResults: Assessment[] = [];
  const groups = [...new Set(i.requirements.map((r) => r.alternativeGroup))].sort((a, b) => a - b);
  for (const g of groups) {
    const results: Assessment[] = [];
    for (const req of i.requirements.filter((r) => r.alternativeGroup === g)) {
      const typeIds = i.typesOfBody[req.bodyCode] ?? [];
      const own: ConditionRow[] = [];
      if (typeIds.length === 0) own.push({ kind: "REGISTRATION", result: "NOT_ASSESSED", reason: "NO_DOCUMENT_TYPE_FOR_BODY", requirementId: req.id, data: { body: req.bodyLabel } });
      else {
        const w = registrationReading(typeIds, i.docs, i.window, i.policy)!;
        own.push({ kind: "REGISTRATION", result: w.result, reason: w.reason, requirementId: req.id, data: { body: req.bodyLabel, ...(w.data ?? {}) } });
      }
      if (req.structured) {
        const permitted = (r: "GRADE" | "FIELD_CODE") => i.permissions.some((p) => p.requirementId === req.id && p.relaxes === r);
        own.push(...structuredRows(req, heldValues(typeIds, i.docs, i.valuesOf, i.on), permitted));
      }
      // Words an officer typed are never parsed, and never quietly promoted (AGENTS.md rule 2): beside the structured needs they stay "stated in words only, not compared", so the
      // requirement reads "not assessed" for them. Words composed from the needs say nothing more than the needs, and are not a second condition.
      if (req.qualifiers.trim() && !(req.structured && req.qualifiersFromNeeds)) {
        own.push({ kind: "QUALIFIERS", result: "NOT_ASSESSED", reason: "QUALIFIERS_IN_WORDS", requirementId: req.id, data: { body: req.bodyLabel, qualifiers: req.qualifiers.trim() } });
      }
      rows.push(...own);
      results.push(combine(own.map((r) => r.result)));
    }
    groupResults.push(results.includes("PASS") ? "PASS" : results.includes("NOT_ASSESSED") ? "NOT_ASSESSED" : "FAIL");
  }

  if (i.restrictedTender == null) rows.push({ kind: "RESTRICTION", result: "NOT_ASSESSED", reason: "RESTRICTION_NOT_STATED", requirementId: null });
  else if (i.restrictedTender) {
    if (!i.policy.restrictionEvidenceTypeId) rows.push({ kind: "RESTRICTION", result: "NOT_ASSESSED", reason: "EVIDENCE_TYPE_NOT_SET", requirementId: null });
    else {
      const w = windowValidity(i.docs.filter((d) => d.typeId === i.policy.restrictionEvidenceTypeId), i.window, i.policy);
      rows.push({ kind: "RESTRICTION", result: w.result, reason: w.reason, requirementId: null, ...(w.data ? { data: w.data } : {}) });
    }
  }

  const outside = rows.filter((r) => r.requirementId == null).map((r) => r.result);
  const all = combine([...outside, ...groupResults]);
  return { verdict: all === "PASS" ? "ELIGIBLE" : all === "FAIL" ? "NOT_ELIGIBLE" : "NOT_ASSESSED", rows };
}

/// What is frozen where eligibility is relied on (a sale, an opening): the verdict, its rows and the day.
export interface EligibilitySnapshot {
  judgedOn: string;
  supplierId: string;
  supplierReference: string;
  standing: string;
  verdict: Verdict;
  rows: ConditionRow[];
}

export const isEligibilitySnapshot = (v: unknown): v is EligibilitySnapshot => !!v && typeof v === "object" && "verdict" in v && Array.isArray((v as EligibilitySnapshot).rows);

export { passes };
