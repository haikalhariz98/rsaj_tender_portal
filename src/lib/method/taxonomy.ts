/**
 * The other taxonomies a contract carries, derived from the canonical type rather than
 * asked for again (FR-MTD-014, ruling R-10).
 *
 * A mapping row gives a type's value in one taxonomy, optionally only when the chosen
 * basis, or another taxonomy's value, says so. The most specific rows that apply win.
 * One value: derived. Several: ambiguous, and the officer picks once — the pick is
 * stored as chosen and resolves it from then on. None: not mapped, shown as such. The
 * basis itself is never derived: the officer always chooses it (ruling R-9).
 */

import type { Taxonomy, TaxonomyMapping, TaxonomyPick } from "./types";

export type TaxonomyState = "DERIVED" | "CHOSEN" | "AMBIGUOUS" | "NOT_MAPPED" | "AWAITING_TYPE";

export interface TaxonomyOutcome {
  taxonomyCode: string;
  state: TaxonomyState;
  valueCode: string | null;
  candidates: string[];
}

/**
 * The taxonomies that classify a contract: every configured one except those a policy keeps
 * as a plain list (6.4 increment 2: the regulator permits an exercise chooses from,
 * FR-DOC-006). A list is chosen from on its own screen; it is never derived from the type,
 * so it never reads "Not mapped" on an exercise's classification.
 */
export function classificationTaxonomies<T extends { code: string }>(all: readonly T[], listCodes: readonly (string | null | undefined)[]): T[] {
  const lists = new Set(listCodes.filter((c): c is string => !!c));
  return all.filter((t) => !lists.has(t.code));
}

/**
 * 64-C1: while the tender-documents policy names a taxonomy as the regulator-permit list, that
 * list is left out of classification (above), so nothing may be built to read it as one. A
 * contract-type mapping into it would never be derived, and a mapping conditioned on it would
 * never apply, because no exercise ever carries a derived value in it. Both are refused on
 * save; one set up before the refusal existed is reported as ignored, never quietly dropped.
 */
export type PermitListMappingFault = "MAPS_INTO_PERMIT_LIST" | "CONDITIONED_ON_PERMIT_LIST";

/// Field-keyed, so the form marks the field. No permit list named: nothing to refuse.
export function permitListMappingFaults(m: { taxonomyCode: string; whenTaxonomyCode: string | null }, permitListCode: string | null): { code: PermitListMappingFault; field: "taxonomyCode" | "whenTaxonomyCode" }[] {
  if (!permitListCode) return [];
  return [
    ...(m.taxonomyCode === permitListCode ? [{ code: "MAPS_INTO_PERMIT_LIST" as const, field: "taxonomyCode" as const }] : []),
    ...(m.whenTaxonomyCode === permitListCode ? [{ code: "CONDITIONED_ON_PERMIT_LIST" as const, field: "whenTaxonomyCode" as const }] : []),
  ];
}

export const PERMIT_LIST_MAPPING_FAULT_TEXT: Readonly<Record<PermitListMappingFault, string>> = {
  MAPS_INTO_PERMIT_LIST:
    "That classification is the permit list named under Configuration, Tender documents. Permits are chosen on each exercise and never derived from a contract type, so this mapping would be ignored. Map into another classification, or name a different permit list there first.",
  CONDITIONED_ON_PERMIT_LIST:
    "That condition reads the permit list named under Configuration, Tender documents. Permits are chosen on each exercise, so no exercise is ever classified in it and this mapping would never apply. Condition it on another classification, or name a different permit list there first.",
};

/**
 * The mappings already configured that the permit list makes inert, for one contract type
 * (or every type when none is given): each with the reason it is ignored. Order kept.
 */
export function ignoredPermitListMappings<M extends { contractTypeCode: string; taxonomyCode: string; whenTaxonomyCode: string | null }>(
  mappings: readonly M[],
  permitListCode: string | null,
  contractTypeCode?: string | null,
): { mapping: M; why: PermitListMappingFault }[] {
  if (!permitListCode) return [];
  return mappings
    .filter((m) => contractTypeCode == null || m.contractTypeCode === contractTypeCode)
    .flatMap((m) => {
      const f = permitListMappingFaults(m, permitListCode);
      return f.length ? [{ mapping: m, why: f[0].code }] : [];
    });
}

/// The screen's warning for those mappings, in words: the list's name, never its code.
export function ignoredMappingsText(count: number, listName: string): string {
  return `${count} ${count === 1 ? "mapping for this contract type maps into, or is conditioned on," : "mappings for this contract type map into, or are conditioned on,"} ${listName}. ${count === 1 ? "It is" : "They are"} ignored: that list is the permit list named under Configuration, Tender documents, chosen on each exercise and never derived from the type. Remove ${count === 1 ? "it" : "them"} under Configuration, Reference data, or name a different permit list.`;
}

const conditions = (m: TaxonomyMapping) => (m.whenBasisCode ? 1 : 0) + (m.whenTaxonomyCode ? 1 : 0);

export function deriveTaxonomies(
  typeCode: string | null,
  basisCode: string | null,
  picks: readonly { taxonomyCode: string; valueCode: string; pick: TaxonomyPick }[],
  mappings: readonly TaxonomyMapping[],
  taxonomies: readonly Taxonomy[],
  on: Date,
): TaxonomyOutcome[] {
  const live = taxonomies.filter((t) => t.retiredOn == null || t.retiredOn > on);
  if (!typeCode) return live.map((t) => ({ taxonomyCode: t.code, state: "AWAITING_TYPE" as const, valueCode: null, candidates: [] }));
  const resolved = new Map<string, string>();
  const out = new Map<string, TaxonomyOutcome>();

  // Rows conditioned on another taxonomy wait for it: a few passes settle the chain.
  for (let pass = 0; pass < live.length + 1; pass++) {
    let changed = false;
    for (const t of live) {
      const valid = new Set(t.values.filter((v) => v.retiredOn == null || v.retiredOn > on).map((v) => v.code));
      const rows = mappings.filter(
        (m) =>
          m.contractTypeCode === typeCode &&
          m.taxonomyCode === t.code &&
          valid.has(m.valueCode) &&
          (m.whenBasisCode == null || m.whenBasisCode === basisCode) &&
          (m.whenTaxonomyCode == null || resolved.get(m.whenTaxonomyCode) === m.whenValueCode),
      );
      const best = Math.max(-1, ...rows.map(conditions));
      const candidates = [...new Set(rows.filter((r) => conditions(r) === best).map((r) => r.valueCode))].sort();
      const pick = picks.find((p) => p.taxonomyCode === t.code && p.pick === "CHOSEN");
      let o: TaxonomyOutcome;
      if (candidates.length === 0) o = { taxonomyCode: t.code, state: "NOT_MAPPED", valueCode: null, candidates };
      else if (candidates.length === 1) o = { taxonomyCode: t.code, state: "DERIVED", valueCode: candidates[0], candidates };
      else if (pick && candidates.includes(pick.valueCode)) o = { taxonomyCode: t.code, state: "CHOSEN", valueCode: pick.valueCode, candidates };
      else o = { taxonomyCode: t.code, state: "AMBIGUOUS", valueCode: null, candidates };
      const prev = out.get(t.code);
      if (!prev || prev.state !== o.state || prev.valueCode !== o.valueCode || prev.candidates.join() !== o.candidates.join()) changed = true;
      out.set(t.code, o);
      if (o.valueCode) resolved.set(t.code, o.valueCode);
      else resolved.delete(t.code);
    }
    if (!changed) break;
  }
  return live.map((t) => out.get(t.code)!);
}
