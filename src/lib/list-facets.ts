import type { Tx } from "@/lib/db";
import { dayPlus, dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { departmentUnits } from "@/lib/insights/query";
import { listHref, type ListFacets, type ListQuery } from "@/lib/list-query";

/**
 * I-6: the dropdowns that show and change a list's dashboard facets (design note 0007, DB-4). Each option carries the address it goes to, made by
 * `listHref`, so the choice is kept in the address and the page starts again. A code the address names that the organisation no longer configures
 * stays selectable under a plain label, so a filtered list never hides why it is short. Pure.
 */

export interface FacetSpec {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string; href: string }[];
}

export interface FacetChoices {
  units: { code: string; label: string }[];
  routes: { code: string; label: string }[];
  methods: { code: string; label: string }[];
}

/// The organisation's own department units (the dashboard's list), funding routes and sourcing methods, for the dropdowns.
export async function facetChoices(client: Tx, organisationId: string): Promise<FacetChoices> {
  const [units, routes, methods] = await Promise.all([
    client.orgUnit.findMany({ where: { organisationId }, select: { code: true, nameEn: true, kind: true }, orderBy: { nameEn: "asc" } }),
    client.fundingRoute.findMany({ where: { organisationId }, select: { code: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    client.sourcingMethod.findMany({ where: { organisationId }, select: { code: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
  ]);
  const seen = new Set<string>();
  return {
    units: departmentUnits(units).flatMap((u) => (seen.has(u.code) ? [] : (seen.add(u.code), [{ code: u.code, label: u.nameEn }]))),
    routes: routes.map((r) => ({ code: r.code, label: r.nameEn })),
    methods: methods.map((m) => ({ code: m.code, label: m.nameEn })),
  };
}

const at = (base: string, q: ListQuery, change: Partial<ListFacets>) => listHref(base, { ...q, ...change, page: 0 });

/// One dropdown over a code facet: "Any" first, then the choices.
export function codeFacet(base: string, q: ListQuery, key: "unit" | "route" | "method", label: string, any: string, choices: readonly { code: string; label: string }[], unlisted: string): FacetSpec {
  const current = q[key];
  const options = [{ value: "", label: any }, ...choices.map((c) => ({ value: c.code, label: c.label }))];
  if (current && !choices.some((c) => c.code === current)) options.push({ value: current, label: unlisted });
  return { key, label, value: current ?? "", options: options.map((o) => ({ ...o, href: at(base, q, { [key]: o.value || null }) })) };
}

/// The day range, as words: "1 Jan 2026 to 31 Dec 2026" (`to` is exclusive in the address, so the last day shown is the day before it).
export const rangeText = (from: string, to: string): string => `${formatDate(dayToDate(from))} to ${formatDate(dayToDate(dayPlus(to, -1)))}`;

/// The range chip: "Any date" or the range the address carries; null when none is set (nothing to clear). `label` names what the range is of.
export function rangeFacet(base: string, q: ListQuery, label: string): FacetSpec | null {
  if (!q.from || !q.to) return null;
  const now = rangeText(q.from, q.to);
  return {
    key: "range",
    label,
    value: "set",
    options: [
      { value: "", label: "Any date", href: at(base, q, { from: null, to: null, stage: q.stage === "approved" ? null : q.stage }) },
      { value: "set", label: now, href: at(base, q, {}) },
    ],
  };
}

/// A dropdown over the list's own stage words (sourcing: open, preparing, in market, evaluating). A word the list does not know stays selectable as "Unknown stage".
export function stageFacet(base: string, q: ListQuery, label: string, any: string, stages: readonly { value: string; label: string }[]): FacetSpec {
  const options = [{ value: "", label: any }, ...stages];
  if (q.stage && !stages.some((s) => s.value === q.stage)) options.push({ value: q.stage, label: "Unknown stage" });
  return { key: "stage", label, value: q.stage ?? "", options: options.map((o) => ({ ...o, href: at(base, q, { stage: o.value || null }) })) };
}
