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
  sources: { code: string; label: string }[];
}

/// The organisation's own department units (the dashboard's list), funding routes and sourcing methods, for the dropdowns.
export async function facetChoices(client: Tx, organisationId: string): Promise<FacetChoices> {
  const [units, routes, methods, sources] = await Promise.all([
    client.orgUnit.findMany({ where: { organisationId }, select: { code: true, nameEn: true, kind: true, effectiveFrom: true }, orderBy: { nameEn: "asc" } }),
    client.fundingRoute.findMany({ where: { organisationId }, select: { code: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    client.sourcingMethod.findMany({ where: { organisationId }, select: { code: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    client.fundingSource.findMany({ where: { organisationId }, select: { code: true, nameEn: true }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
  ]);
  return {
    units: departmentUnits(units).map((u) => ({ code: u.code, label: u.nameEn })),
    routes: routes.map((r) => ({ code: r.code, label: r.nameEn })),
    methods: methods.map((m) => ({ code: m.code, label: m.nameEn })),
    sources: sources.map((s) => ({ code: s.code, label: s.nameEn })),
  };
}

const at = (base: string, q: ListQuery, change: Partial<ListFacets>) => listHref(base, { ...q, ...change, page: 0 });

/// One dropdown over a code facet: "Any" first, then the choices.
export function codeFacet(base: string, q: ListQuery, key: "unit" | "route" | "method" | "source", label: string, any: string, choices: readonly { code: string; label: string }[], unlisted: string): FacetSpec {
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

/// The sourcing list's stage words and their labels, shared by its dropdown and the export's audit entry; requisitions' "approved" is the other stage word.
export const SOURCING_STAGES = [
  { value: "open", label: "Open (any stage)" },
  { value: "preparing", label: "Preparing" },
  { value: "in_market", label: "In market" },
  { value: "evaluating", label: "Evaluating" },
] as const;
const STAGE_LABEL: Record<string, string> = { ...Object.fromEntries(SOURCING_STAGES.map((s) => [s.value, s.label])), approved: "Approved", awaiting: "Awaiting award" };

/// The active facets as labelled lines for the export's audit entry (never codes): department, funding route, funding source, method, stage, and the day range in words. Unset facets are left out.
export async function facetLabels(client: Tx, organisationId: string, f: ListFacets): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (f.unit) out.department = (await client.orgUnit.findFirst({ where: { organisationId, code: f.unit }, orderBy: { effectiveFrom: "desc" }, select: { nameEn: true } }))?.nameEn ?? "A unit no longer configured";
  if (f.route) out.fundingRoute = (await client.fundingRoute.findFirst({ where: { organisationId, code: f.route }, select: { nameEn: true } }))?.nameEn ?? "A route no longer configured";
  if (f.source) out.fundingSource = (await client.fundingSource.findFirst({ where: { organisationId, code: f.source }, select: { nameEn: true } }))?.nameEn ?? "A source no longer configured";
  if (f.method) out.method = (await client.sourcingMethod.findFirst({ where: { organisationId, code: f.method }, select: { nameEn: true } }))?.nameEn ?? "A method no longer configured";
  if (f.stage) out.stage = STAGE_LABEL[f.stage] ?? "Unknown stage";
  if (f.from && f.to) out.dateRange = rangeText(f.from, f.to);
  return out;
}
