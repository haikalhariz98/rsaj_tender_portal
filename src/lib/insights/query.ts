/**
 * The Dashboard's address: which tab, which financial year, which department and the one filter the tab takes (design note 0007
 * §4). Read defensively, so a hand-edited address only ever asks for a known year, unit, route or method; anything else falls
 * back to the default and never errors. Pure.
 */

import { maySeeSettings } from "@/lib/nav";

export const INSIGHTS_TABS = ["overview", "budget", "requisitions", "tenders", "projects"] as const;
export type InsightsTab = (typeof INSIGHTS_TABS)[number];

/// The filter each tab takes besides the year and the department (§5). A filter the tab does not take is dropped, so it can
/// never narrow a figure the reader cannot see a control for.
const TAB_FILTER: Readonly<Record<InsightsTab, "route" | "method" | null>> = {
  overview: null,
  budget: null,
  requisitions: "route",
  tenders: "method",
  projects: null,
};

export interface InsightsQuery {
  tab: InsightsTab;
  /// Null only while no financial year exists at all (`financialYear` then answers NOT_SET).
  year: number | null;
  /// A department's unit code (`departmentUnits`).
  unit: string | null;
  /// A funding route's code, on the Requisitions tab only.
  route: string | null;
  /// A sourcing method's code, on the Tenders tab only.
  method: string | null;
}

/// What the address may name, from the organisation's own configuration.
export interface InsightsChoices {
  /// Every year that has budget periods (`yearsIn`).
  years: readonly number[];
  /// `defaultYear(periods)`: the year Budget lands on.
  defaultYear: number | null;
  /// The codes of `departmentUnits(...)`.
  units: readonly string[];
  routes: readonly string[];
  methods: readonly string[];
  /// `mayReadBudget(reader)`: without it the Budget tab does not exist for the reader.
  budget: boolean;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const known = (v: string | undefined, allowed: readonly string[]): string | null => (v !== undefined && allowed.includes(v) ? v : null);

export function parseInsightsQuery(sp: Params, c: InsightsChoices): InsightsQuery {
  const asked = one(sp.tab);
  const tab: InsightsTab = (INSIGHTS_TABS as readonly string[]).includes(asked ?? "") && (asked !== "budget" || c.budget) ? (asked as InsightsTab) : "overview";
  const yearText = one(sp.year);
  const year = c.years.find((y) => String(y) === yearText) ?? c.defaultYear;
  return {
    tab,
    year,
    unit: known(one(sp.unit), c.units),
    route: TAB_FILTER[tab] === "route" ? known(one(sp.route), c.routes) : null,
    method: TAB_FILTER[tab] === "method" ? known(one(sp.method), c.methods) : null,
  };
}

/// The filter the tab draws besides the year and the department, for the screen.
export const tabFilter = (tab: InsightsTab): "route" | "method" | null => TAB_FILTER[tab];

/// The Dashboard's address for a query: what a tile, a tab or Reset links to. Empty filters are left out.
export function insightsHref(q: Partial<InsightsQuery> & { tab: InsightsTab }): string {
  const sp = new URLSearchParams({ tab: q.tab });
  if (q.year != null) sp.set("year", String(q.year));
  for (const k of ["unit", "route", "method"] as const) if (q[k]) sp.set(k, q[k]);
  return `/dashboard?${sp}`;
}

/**
 * The one unit list the Department filter offers on every tab (DB-10): the units of kind Department, as the requisition form
 * offers them for "Requesting department". The requisitions' filter (`requestingUnitCode`) and the budget codes' filter
 * (`owningUnitCode`) take a code from this same list. Flat, with no roll-up: a budget code owned by a section or a division is
 * reached by no Department filter (note 0007 §4, the known gap). Pass every unit, retired ones included, for a past year's records.
 */
export function departmentUnits<U extends { kind: string }>(units: readonly U[]): U[] {
  return units.filter((u) => u.kind === "DEPARTMENT");
}

/**
 * Who may read budget figures (DB-3): whoever may see Settings, or holds `sulit.read.organisation`. One predicate for the
 * Dashboard's Budget tab, its Budget used tile and the Budget page itself, so the three cannot drift apart.
 */
export function mayReadBudget(who: { isAdministrator: boolean; permissions: ReadonlySet<string> }): boolean {
  return maySeeSettings(who) || who.permissions.has("sulit.read.organisation");
}
