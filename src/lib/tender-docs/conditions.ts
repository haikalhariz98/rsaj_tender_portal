/**
 * The tender's conditions (6.4 increment 2), judged together at submission and frozen on the
 * pack: the eligibility block and its validity window (FR-DOC-005), the restriction and its
 * stamp (FR-DOC-009), the regulator permit (FR-DOC-006), the mandatory clauses (FR-DOC-011),
 * document assurance (FR-DOC-014) and the Tender Table Document's parts (FR-DOC-010, the
 * part this module builds: which parts it holds; its publication window is 6.5's, its
 * inspection log sign-in's). One family of findings beside the parts', the scope's and the
 * Appendix's, each worded with its fix (labels.ts). Pure.
 */

import { fieldsNamed } from "@/lib/templates/merge";

import { assuranceFaults, assuranceKindsFor, type AssuranceFault, type ConfirmationFacts } from "./assurance";
import { clauseFaults, clauseFieldValues, liveClauses, type ClauseFacts, type ClauseFault, type OverrideFacts } from "./clauses";
import { bodiesOf, eligibilityFaults, eligibilityFieldValues, noticeFaults, registrationText, validityWindowText, type EligibilityFault, type NoticeFault, type RegistrationBodyFacts, type RequirementFacts } from "./eligibility";
import { PERMIT_FIELD, WINDOW_FIELD } from "./fields";
import { permitFaults, permitLabel, type PermitFault, type PermitList } from "./permit";
import { restrictionFaults, stampFor, type RestrictionFault, type StampWords } from "./stamp";
import type { DocumentLanguage, Finding, PackPartFacts } from "./types";

export interface ConditionsInput {
  /// The organisation's day the pack is judged on.
  today: string;
  eligibility: { requirements: readonly RequirementFacts[]; bodies: readonly RegistrationBodyFacts[] };
  restriction: { restricted: boolean | null; label: string | null; stamp: StampWords };
  permit: { regulated: boolean | null; permitCode: string | null; list: PermitList | null };
  clauses: { clauses: readonly ClauseFacts[]; overrides: readonly OverrideFacts[] };
  assurance: { required: boolean | null; confirmations: readonly ConfirmationFacts[] };
}

export type TableDocumentFault = "TABLE_DOCUMENT_UNSET" | "TABLE_DOCUMENT_EMPTY";

/// Every part not omitted says whether it is in the Tender Table Document (unset is not "no"), and the table document holds at least one.
export function tableDocumentFaults(parts: readonly PackPartFacts[]): Finding<TableDocumentFault>[] {
  const live = parts.filter((p) => p.state !== "OMITTED");
  const out: Finding<TableDocumentFault>[] = live.filter((p) => p.inTableDocument == null).map((p) => ({ code: "TABLE_DOCUMENT_UNSET" as const, level: "block" as const, data: { part: `${p.printedNumber}. ${p.label}` } }));
  if (live.length && !live.some((p) => p.inTableDocument === true)) out.push({ code: "TABLE_DOCUMENT_EMPTY", level: "block" });
  return out;
}

export type ConditionsFault = EligibilityFault | NoticeFault | RestrictionFault | PermitFault | ClauseFault | AssuranceFault | TableDocumentFault;

/// Every condition the pack is judged by, in the order the card lists them.
export function conditionsFaults(parts: readonly PackPartFacts[], c: ConditionsInput): Finding<ConditionsFault>[] {
  return [
    ...eligibilityFaults(c.eligibility.requirements, c.eligibility.bodies, c.today),
    ...noticeFaults(parts),
    ...restrictionFaults({ restricted: c.restriction.restricted, stamp: c.restriction.stamp, parts }),
    ...permitFaults({ ...c.permit, parts }),
    ...clauseFaults(parts, c.clauses.clauses, c.clauses.overrides, c.today),
    ...assuranceFaults(c.assurance.required, parts, c.assurance.confirmations),
    ...tableDocumentFaults(parts),
  ];
}

/// Whether a ready template part states the validity window: then the approving step must record the days it states.
export const statesWindow = (parts: readonly PackPartFacts[]) => parts.some((p) => p.state === "READY" && p.source === "TEMPLATE" && bodiesOf(p).some((b) => fieldsNamed(b).includes(WINDOW_FIELD)));

/**
 * The merge values the conditions add, per language: the registrations and their window (the
 * proposed days), the permit's name, and each live clause's words.
 */
export function conditionFieldValues(c: ConditionsInput, window: { startOn: string; closingDay: string } | null): Record<DocumentLanguage, Record<string, string>> {
  const live = liveClauses(c.clauses.clauses, c.today);
  const one = (lang: DocumentLanguage) => ({ ...eligibilityFieldValues(c.eligibility.requirements, window, lang), [PERMIT_FIELD]: permitLabel(c.permit.regulated, c.permit.permitCode, c.permit.list, lang) ?? "", ...clauseFieldValues(live, lang) });
  return { EN: one("EN"), MS: one("MS") };
}

/// The stamp each generated document carries, by language; null where the tender is not restricted.
export const conditionStamp = (c: ConditionsInput) => stampFor(c.restriction.restricted, c.restriction.stamp);

/**
 * What the pack was judged under, in words, frozen on it at submission (TenderPack
 * `conditionsSnapshot`): later configuration never rewrites it. Null fields read "Not set".
 */
export function conditionsSnapshot(parts: readonly PackPartFacts[], c: ConditionsInput, window: { startOn: string; closingDay: string } | null) {
  const live = liveClauses(c.clauses.clauses, c.today);
  return {
    judgedOn: c.today,
    eligibility: {
      requirements: c.eligibility.requirements.map((r) => ({ body: r.bodyLabel, qualifiers: r.qualifiers, alternativeGroup: r.alternativeGroup })),
      text: c.eligibility.requirements.length ? registrationText(c.eligibility.requirements, "EN") : null,
      window: window ? validityWindowText(window.startOn, window.closingDay, "EN") : null,
    },
    /// The days the frozen documents state as the validity window; null where none states it.
    windowStated: statesWindow(parts) && window ? window : null,
    restriction: { restricted: c.restriction.restricted, label: c.restriction.label, stampEn: c.restriction.restricted ? c.restriction.stamp.EN : null, stampMs: c.restriction.restricted ? c.restriction.stamp.MS : null },
    permit: { regulated: c.permit.regulated, permit: permitLabel(c.permit.regulated, c.permit.permitCode, c.permit.list), list: c.permit.list?.name ?? null },
    clauses: live.filter((x) => x.mandatoryInAgreements === true).map((x) => ({ title: x.titleEn, bodyVersion: x.bodyVersion, overriddenBy: c.clauses.overrides.find((o) => o.clauseCode === x.code)?.personName ?? null, overrideReason: c.clauses.overrides.find((o) => o.clauseCode === x.code)?.reason ?? null })),
    assurance: { required: c.assurance.required, needed: c.assurance.required ? assuranceKindsFor(parts) : [], confirmations: c.assurance.confirmations.map((x) => ({ kind: x.kind, person: x.personName, on: x.confirmedOn })) },
    tableDocument: parts.filter((p) => p.state !== "OMITTED" && p.inTableDocument === true).map((p) => `${p.printedNumber}. ${p.label}`),
  };
}

export type ConditionsSnapshot = ReturnType<typeof conditionsSnapshot>;

/// A stored snapshot, as a reader takes it; null where the pack was frozen before increment 2 or the record is not one.
export function readConditionsSnapshot(stored: unknown): ConditionsSnapshot | null {
  if (!stored || typeof stored !== "object") return null;
  const s = stored as Partial<ConditionsSnapshot>;
  return typeof s.judgedOn === "string" && s.eligibility && s.restriction && s.permit && Array.isArray(s.clauses) && s.assurance && Array.isArray(s.tableDocument) ? (s as ConditionsSnapshot) : null;
}
