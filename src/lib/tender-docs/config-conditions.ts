/**
 * Configuration › Tender documents, increment 2: the registration bodies an exercise's
 * eligibility is drawn from (FR-DOC-005), the clauses agreements carry (FR-DOC-011), and the
 * policy's restriction wording (FR-DOC-009), assurance answer (FR-DOC-014) and list of
 * regulator permits (FR-DOC-006). Nothing ships set. Pure checks a save runs on the rows it
 * reads under the organisation's lock.
 */

import { partRetiredOn } from "./config";
import type { Finding } from "./types";

export type BodyConfigFault = "CODE_REQUIRED" | "CODE_TAKEN" | "LABEL_REQUIRED" | "PROVENANCE_REQUIRED";

/// A registration body as saved: a code of its own, a name, and where it comes from.
export function bodyConfigFaults(b: { id?: string; code: string; labelEn: string; provenance: string | null }, others: readonly { id: string; code: string }[]): Finding<BodyConfigFault>[] {
  const out: Finding<BodyConfigFault>[] = [];
  const f = (code: BodyConfigFault, field: string) => out.push({ code, level: "block", data: { field } });
  if (!/^[a-z0-9_]+$/.test(b.code)) f("CODE_REQUIRED", "code");
  else if (others.some((o) => o.id !== b.id && o.code === b.code)) f("CODE_TAKEN", "code");
  if (!b.labelEn.trim()) f("LABEL_REQUIRED", "labelEn");
  if (!b.provenance) f("PROVENANCE_REQUIRED", "provenance");
  return out;
}

export const BODY_CONFIG_FAULT_TEXT: Readonly<Record<BodyConfigFault, string>> = {
  CODE_REQUIRED: "Give a code of lower-case letters, digits and underscores.",
  CODE_TAKEN: "That code is already in use.",
  LABEL_REQUIRED: "Give the body's name as the notice prints it.",
  PROVENANCE_REQUIRED: "Say where this comes from.",
};

export type ConditionsPolicyFault = "PROVENANCE_REQUIRED" | "TAXONOMY_UNKNOWN";

/**
 * The policy's increment-2 values as saved: restriction wording given says where it comes
 * from; the assurance answer given says where it comes from; the permit list is a configured
 * taxonomy.
 */
export function conditionsPolicyFaults(p: { restrictionLabelEn: string | null; restrictionStampTextEn: string | null; restrictionStampTextMs: string | null; restrictionProvenance: string | null; assuranceRequired: boolean | null; assuranceProvenance: string | null; regulatorPermitTaxonomyCode: string | null }, taxonomies: readonly string[]): Finding<ConditionsPolicyFault>[] {
  const out: Finding<ConditionsPolicyFault>[] = [];
  if ((p.restrictionLabelEn || p.restrictionStampTextEn || p.restrictionStampTextMs) && !p.restrictionProvenance) out.push({ code: "PROVENANCE_REQUIRED", level: "block", data: { field: "restrictionProvenance" } });
  if (p.assuranceRequired != null && !p.assuranceProvenance) out.push({ code: "PROVENANCE_REQUIRED", level: "block", data: { field: "assuranceProvenance" } });
  if (p.regulatorPermitTaxonomyCode && !taxonomies.includes(p.regulatorPermitTaxonomyCode)) out.push({ code: "TAXONOMY_UNKNOWN", level: "block", data: { field: "regulatorPermitTaxonomyCode" } });
  return out;
}

export const CONDITIONS_POLICY_FAULT_TEXT: Readonly<Record<ConditionsPolicyFault, string>> = {
  PROVENANCE_REQUIRED: "Say where this comes from.",
  TAXONOMY_UNKNOWN: "That list is not configured. Choose one from the list.",
};

/**
 * Increment 2's settings whose absence holds every submission back (62-C4's rule): the
 * assurance answer not set, and a live clause whose "mandatory" is not set. The restriction
 * stamp and the permit list hold back only an exercise that needs them, so they are said
 * where they are needed, not counted here.
 */
export function conditionsHoldingWorkBack(assuranceRequired: boolean | null, clauses: readonly { retiredOn: string | null; mandatoryInAgreements: boolean | null }[], today: string | null): number {
  return (assuranceRequired == null ? 1 : 0) + clauses.filter((c) => partRetiredOn(c.retiredOn, today) !== true && c.mandatoryInAgreements == null).length;
}
