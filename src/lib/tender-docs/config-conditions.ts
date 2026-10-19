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

export type ConditionsPolicyFault = "PROVENANCE_REQUIRED" | "TAXONOMY_UNKNOWN" | "TAXONOMY_CLASSIFIES" | "TAXONOMY_CLASSIFIED_EXERCISES" | "TAXONOMY_NAMED_BY_POLICY";

/// Where a configured taxonomy is already in use: what makes it a classification rather than a plain list.
export interface TaxonomyUse {
  /// TaxonomyMapping rows that give a contract type's value in it, or condition another mapping on it.
  mappings: number;
  /// Exercises already classified in it.
  exercises: number;
  /// The policies that name it, in words (the scope policy's panel taxonomies).
  policies: string[];
}

/// Count what uses each taxonomy: the mapping rows, the exercises' values, and the policies that name one.
export function taxonomyUses(
  codes: readonly string[],
  mappings: readonly { taxonomyCode: string; whenTaxonomyCode: string | null }[],
  exerciseValues: readonly { taxonomyCode: string }[],
  policies: readonly { name: string; codes: readonly (string | null)[] }[],
): Map<string, TaxonomyUse> {
  return new Map(
    codes.map((c) => [
      c,
      {
        mappings: mappings.filter((m) => m.taxonomyCode === c || m.whenTaxonomyCode === c).length,
        exercises: exerciseValues.filter((v) => v.taxonomyCode === c).length,
        policies: policies.filter((p) => p.codes.includes(c)).map((p) => p.name),
      },
    ]),
  );
}

/**
 * A regulator-permit list is a plain list chosen from on an exercise. A taxonomy the contract
 * types are mapped into, that exercises are classified in, or that another policy reads is a
 * classification: naming it here would take it out of classification derivation (it is
 * excluded there), so the derivation those rows and policies rely on would silently stop.
 * Refused, with what to do instead.
 */
export function permitListUseFaults(use: TaxonomyUse | undefined): Finding<ConditionsPolicyFault>[] {
  if (!use) return [];
  const f = (code: ConditionsPolicyFault, data?: Finding["data"]) => ({ code, level: "block" as const, data: { field: "regulatorPermitTaxonomyCode", ...data } });
  return [
    ...(use.mappings > 0 ? [f("TAXONOMY_CLASSIFIES", { count: use.mappings })] : []),
    ...(use.exercises > 0 ? [f("TAXONOMY_CLASSIFIED_EXERCISES", { count: use.exercises })] : []),
    ...(use.policies.length > 0 ? [f("TAXONOMY_NAMED_BY_POLICY", { policies: use.policies.join(" and ") })] : []),
  ];
}

/**
 * The policy's increment-2 values as saved: restriction wording given says where it comes
 * from; the assurance answer given says where it comes from; the permit list is a configured
 * taxonomy.
 */
export function conditionsPolicyFaults(p: { restrictionLabelEn: string | null; restrictionStampTextEn: string | null; restrictionStampTextMs: string | null; restrictionProvenance: string | null; assuranceRequired: boolean | null; assuranceProvenance: string | null; regulatorPermitTaxonomyCode: string | null }, taxonomies: readonly string[], uses: ReadonlyMap<string, TaxonomyUse> = new Map()): Finding<ConditionsPolicyFault>[] {
  const out: Finding<ConditionsPolicyFault>[] = [];
  if ((p.restrictionLabelEn || p.restrictionStampTextEn || p.restrictionStampTextMs) && !p.restrictionProvenance) out.push({ code: "PROVENANCE_REQUIRED", level: "block", data: { field: "restrictionProvenance" } });
  if (p.assuranceRequired != null && !p.assuranceProvenance) out.push({ code: "PROVENANCE_REQUIRED", level: "block", data: { field: "assuranceProvenance" } });
  if (p.regulatorPermitTaxonomyCode && !taxonomies.includes(p.regulatorPermitTaxonomyCode)) out.push({ code: "TAXONOMY_UNKNOWN", level: "block", data: { field: "regulatorPermitTaxonomyCode" } });
  else if (p.regulatorPermitTaxonomyCode) out.push(...permitListUseFaults(uses.get(p.regulatorPermitTaxonomyCode)));
  return out;
}

export const CONDITIONS_POLICY_FAULT_TEXT: Readonly<Record<ConditionsPolicyFault, string>> = {
  PROVENANCE_REQUIRED: "Say where this comes from.",
  TAXONOMY_UNKNOWN: "That list is not configured. Choose one from the list.",
  TAXONOMY_CLASSIFIES: "That list classifies contracts. Choose a plain list, or add one under Reference data.",
  TAXONOMY_CLASSIFIED_EXERCISES: "Exercises are already classified in that list. Choose a plain list, or add a new one under Reference data.",
  TAXONOMY_NAMED_BY_POLICY: "Another policy already reads that list. Choose a plain list, or add one under Reference data.",
};

/// A fault's words, with the count or the policies it names where it has them.
export function conditionsPolicyFaultText(f: Finding<ConditionsPolicyFault>): string {
  const base = CONDITIONS_POLICY_FAULT_TEXT[f.code];
  if (f.code === "TAXONOMY_CLASSIFIES") return `${f.data?.count} mapping ${f.data?.count === 1 ? "row maps" : "rows map"} contract types into that list. Choose a plain list, or add one under Reference data.`;
  if (f.code === "TAXONOMY_CLASSIFIED_EXERCISES") return `${f.data?.count} ${f.data?.count === 1 ? "exercise is" : "exercises are"} already classified in that list. Choose another list.`;
  if (f.code === "TAXONOMY_NAMED_BY_POLICY") return `The ${f.data?.policies} already reads that list. Choose a plain list, or add one under Reference data.`;
  return base;
}

/**
 * Increment 2's settings whose absence holds every submission back (62-C4's rule): the
 * assurance answer not set, and a live clause whose "mandatory" is not set. The restriction
 * stamp and the permit list hold back only an exercise that needs them, so they are said
 * where they are needed, not counted here.
 */
export function conditionsHoldingWorkBack(assuranceRequired: boolean | null, clauses: readonly { retiredOn: string | null; mandatoryInAgreements: boolean | null }[], today: string | null): number {
  return (assuranceRequired == null ? 1 : 0) + clauses.filter((c) => partRetiredOn(c.retiredOn, today) !== true && c.mandatoryInAgreements == null).length;
}
