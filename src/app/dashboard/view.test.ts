import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { FinancialYear } from "@/lib/insights/year";
import type { InsightsQuery } from "@/lib/insights/query";
import type { OverviewFigures, ProjectFigures, RequisitionFigures } from "@/lib/insights/store";

import { dashboardView } from "./view";

const q = (o: Partial<InsightsQuery> = {}): InsightsQuery => ({ tab: "overview", year: 2026, unit: null, route: null, method: null, source: null, ...o });
const SET: FinancialYear = { state: "SET", year: 2026, from: "2026-01-01", to: "2027-01-01", periods: [] };
const UNSET: FinancialYear = { state: "NOT_SET", year: null };

const overview = (o: Partial<OverviewFigures> = {}): OverviewFigures => ({
  tab: "overview", fy: SET, budgetUsed: null, raised: 4, openTenders: 3, awarded: { count: 2, amount: 250_000_00n }, paid: 10_000_00n,
  approvals: { count: 5, oldestDays: 3 }, pipeline: [{ stage: "ON_SITE", count: 2 }, { stage: "WITH_CP", count: 1 }], months: [{ month: "2026-01", awarded: 0n, paid: 0n }], ...o,
});

describe("the Dashboard view", () => {
  it("says the year is not set instead of showing a nought, and keeps snapshot tiles", () => {
    const v = dashboardView(overview({ fy: UNSET, raised: null, awarded: null, paid: null, months: null }), q({ year: null }), null);
    const raised = v.tiles.find((t) => t.label.startsWith("Raised"))!;
    expect(raised).toMatchObject({ value: null, hint: "Financial year not set" });
    expect(v.tiles.find((t) => t.label === "Open tenders now")!.value).toBe("3");
    expect(v.charts[1].body.kind).toBe("unset");
  });
  it("draws the Budget used tile only when the figure is given, and says No allocation, never 0 %", () => {
    expect(dashboardView(overview(), q(), null).tiles.some((t) => t.label === "Budget used now")).toBe(false);
    const b = dashboardView(overview({ budgetUsed: { utilisation: null, used: 0n, allocated: 0n } }), q(), null).tiles[0];
    expect(b).toMatchObject({ label: "Budget used now", value: "No allocation" });
  });
  it("links every pipeline bar to its list, carrying the department while one is chosen", () => {
    const hrefs = (u: string | null) => (dashboardView(overview({ pipeline: [{ stage: "WITH_CP", count: 1 }, { stage: "IN_MARKET", count: 1 }, { stage: "ON_SITE", count: 2 }] }), q({ unit: u }), null).charts[0].body as { rows: { href?: string }[] }).rows.map((r) => r.href);
    expect(hrefs(null)).toEqual(["/requisitions?view=pipeline", "/sourcing?stage=in_market", "/projects?view=on_site"]);
    expect(hrefs("dept")).toEqual(["/requisitions?view=pipeline&unit=dept", "/sourcing?unit=dept&stage=in_market", "/projects?view=on_site&unit=dept"]);
  });
  it("labels never show a code", () => {
    const rows = (dashboardView(overview(), q(), null).charts[0].body as { rows: { label: string }[] }).rows;
    expect(rows.map((r) => r.label)).toEqual(["On site", "With C&P"]);
  });
  it("requisition tiles and bars keep their link under a Department or route filter, with the year's days", () => {
    const g = (key: string | null) => ({ key, label: key ?? "None", count: 1, amount: 0n });
    const f: RequisitionFigures = { tab: "requisitions", fy: SET, raised: 1, approved: 1, waiting: 2, overBudget: 0, toApproval: { days: null, across: 0 }, months: null, byDepartment: [g("ws"), g(null)], byRoute: [g("r1")] };
    const v = (o: Partial<InsightsQuery>) => dashboardView(f, q({ tab: "requisitions", ...o }), null);
    const link = (o: Partial<InsightsQuery>, label = "Waiting for approval now") => v(o).tiles.find((t) => t.label === label)!.href;
    expect(link({})).toBe("/requisitions?view=pending");
    expect(link({ route: "r", unit: "u" })).toBe("/requisitions?view=pending&unit=u&route=r");
    expect(link({ unit: "u" }, "Raised in FY 2026")).toBe("/requisitions?unit=u&from=2026-01-01&to=2027-01-01");
    expect(link({}, "Approved in FY 2026")).toBe("/requisitions?stage=approved&from=2026-01-01&to=2027-01-01");
    const rows = (v({ route: "r1" }).charts[1].body as { rows: { href?: string }[] }).rows;
    expect(rows.map((r) => r.href)).toEqual(["/requisitions?unit=ws&route=r1&from=2026-01-01&to=2027-01-01", undefined]);
    expect(dashboardView(f, q({ tab: "requisitions" }), null).tiles[4]).toMatchObject({ value: null, hint: "None approved yet" });
  });
  it("links each project stage bar to its stage view", () => {
    const f = { tab: "projects", fy: SET, stages: [{ stage: "ON_SITE", count: 1 }], live: 1, onSite: 1, onSiteValue: 0n, paid: null, paidByMonth: null, awaitingPayment: { count: 0, oldestDays: null }, variationsOpen: { count: 0, amount: 0n }, topSuppliers: [] } as ProjectFigures;
    const bars = dashboardView(f, q({ tab: "projects" }), null).charts[1].body as { rows: { href?: string }[] };
    expect(bars.rows[0].href).toBe("/projects?view=on_site");
  });
});

describe("the Dashboard page source", () => {
  const src = readFileSync(join(__dirname, "page.tsx"), "utf8");
  it("asks who is signed in before any read", () => {
    expect(src.indexOf("await requireStaff()")).toBeGreaterThan(-1);
    expect(src.indexOf("await requireStaff()")).toBeLessThan(src.indexOf("insightsContext(db"));
  });
  it("never hands the context to a component", () => {
    expect(src).not.toMatch(/<\w+[^>]*\bctx=/);
    expect(src).not.toMatch(/\{\.\.\.ctx\}/);
    for (const f of ["panel.tsx", "view.ts"]) expect(readFileSync(join(__dirname, f), "utf8")).not.toMatch(/InsightsContext|\bctx\b|hiddenExercise/);
  });
  it("is titled Dashboard and read fresh", () => {
    expect(src).toContain('metadata = { title: "Dashboard" }');
    expect(src).toContain('dynamic = "force-dynamic"');
  });
});
