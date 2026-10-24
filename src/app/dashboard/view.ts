/**
 * What the Dashboard draws for one tab: tiles and charts as plain data, from the store's finished figures (design note 0007 §5).
 * Pure, and figures only: it never sees the insights context, so nothing hidden can reach a component. A tile or bar links only
 * where a list holds exactly the same records (§5 drill-down v1), which a Department or Funding route filter breaks, so those
 * drop the link rather than open a longer list.
 */

import type { BarRow, ChartValue } from "@/components/ui/chart";
import type { Tone } from "@/components/ui/badge";
import { storedDay } from "@/lib/dates";
import { formatCompactRM } from "@/lib/format";
import { insightsHref, type InsightsQuery } from "@/lib/insights/query";
import type { Group, PipelineStage } from "@/lib/insights/tiles";
import type { BudgetFigures, OverviewFigures, ProjectFigures, RequisitionFigures, TabFigures, TenderFigures } from "@/lib/insights/store";
import { formatMoney, type Sen } from "@/lib/money";
import type { FinancialYear } from "@/lib/insights/year";

export interface TileSpec {
  label: string;
  /// Null: the figure does not exist (year not set, nothing to average), drawn as a dash.
  value: string | null;
  hint?: string;
  href?: string;
  tone?: Tone;
}

export type ChartBody =
  | { kind: "bars"; head: string; series: string[]; rows: BarRow[]; money: boolean; unit?: "percent"; threshold?: number | null }
  | { kind: "months"; series: string[]; months: { month: string; values: ChartValue[] }[]; money: boolean }
  | { kind: "trend"; series: [string, string]; points: { label: string; value: ChartValue | null; reference: ChartValue }[] }
  | { kind: "unset" };

export interface ChartSpec {
  title: string;
  body: ChartBody;
}

export interface TabView {
  tiles: TileSpec[];
  charts: ChartSpec[];
}

export const money = (v: ChartValue): string => formatCompactRM(BigInt(v));
export const moneyExact = (v: ChartValue): string => formatMoney(BigInt(v) as Sen);
const percent = (n: number): string => `${Number(n.toFixed(1))}%`;
const days = (n: number): string => `${n} ${n === 1 ? "day" : "days"}`;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const NOT_SET = "Financial year not set";
const fyName = (fy: FinancialYear): string => (fy.state === "SET" ? `FY ${fy.year}` : "the financial year");
/// A year-bound figure: its value, or a dash with the reason while the year is not set.
const inYear = <T,>(fy: FinancialYear, v: T | null, show: (v: T) => string, hint?: (v: T) => string | undefined): Pick<TileSpec, "value" | "hint"> =>
  fy.state === "NOT_SET" || v == null ? { value: null, hint: NOT_SET } : { value: show(v), hint: hint?.(v) };

const STAGE: Record<PipelineStage, string> = {
  WITH_CP: "With C&P",
  PREPARING: "Preparing",
  IN_MARKET: "In market",
  EVALUATING: "Evaluating",
  AWARDING: "Awarding",
  SIGNING: "Signing",
  ON_SITE: "On site",
};
const CASE_STAGE = { AWARDING: "Awarding", SIGNING: "Signing", ON_SITE: "On site", COMPLETED: "Completed", CLOSED: "Closed" } as const;

const countRows = (gs: readonly Group[]): BarRow[] => gs.map((g) => ({ label: g.label, values: [g.count] }));
const amountRows = (gs: readonly Group[]): BarRow[] => gs.map((g) => ({ label: g.label, values: [g.amount] }));

/// A chart held back while the year is not set; otherwise the body built from the figure.
const yearBound = <T,>(v: T | null, make: (v: T) => ChartBody): ChartBody => (v == null ? { kind: "unset" } : make(v));

function overview(f: OverviewFigures, q: InsightsQuery): TabView {
  const at = (tab: Parameters<typeof insightsHref>[0]["tab"]) => insightsHref({ tab, year: q.year, unit: q.unit });
  const b = f.budgetUsed;
  const stageHref = (s: PipelineStage) => (!q.unit && (s === "AWARDING" || s === "SIGNING" || s === "ON_SITE") ? `/projects?view=${s.toLowerCase()}` : undefined);
  return {
    tiles: [
      ...(b ? [{ label: "Budget used now", value: b.utilisation == null ? "No allocation" : percent(b.utilisation), hint: b.utilisation == null ? undefined : `${formatCompactRM(b.used)} of ${formatCompactRM(b.allocated)}`, href: at("budget") }] : []),
      { label: `Raised in ${fyName(f.fy)}`, ...inYear(f.fy, f.raised, String), href: at("requisitions") },
      { label: "Open tenders now", value: String(f.openTenders), href: at("tenders") },
      { label: `Awarded in ${fyName(f.fy)}`, ...inYear(f.fy, f.awarded, (a) => formatCompactRM(a.amount), (a) => plural(a.count, "award", "awards")), href: at("tenders") },
      { label: `Paid in ${fyName(f.fy)}`, ...inYear(f.fy, f.paid, formatCompactRM), href: at("projects") },
      { label: "Approvals waiting now", value: String(f.approvals.count), hint: [f.approvals.oldestDays == null ? null : `Oldest ${days(f.approvals.oldestDays)}`, "All departments"].filter(Boolean).join(" · "), href: "/approvals" },
    ],
    charts: [
      { title: "Pipeline now", body: { kind: "bars", head: "Stage", series: ["Records"], money: false, rows: f.pipeline.map((p) => ({ label: STAGE[p.stage], values: [p.count], href: stageHref(p.stage) })) } },
      { title: "Money through the year", body: yearBound(f.months, (m) => ({ kind: "months", money: true, series: ["Awarded", "Paid"], months: m.map((x) => ({ month: x.month, values: [x.awarded, x.paid] })) })) },
    ],
  };
}

function budget(f: BudgetFigures, q: InsightsQuery, today: string | null): TabView {
  const href = q.unit ? undefined : `/configuration/budget?tab=availability${q.year == null ? "" : `&year=${q.year}`}`;
  const t = f.totals;
  return {
    tiles: [
      { label: "Allocated", value: formatCompactRM(t.allocated), href },
      { label: "Committed", value: formatCompactRM(t.committed), href },
      { label: "Spent", value: formatCompactRM(t.actualSpend), href },
      { label: "Available", value: formatCompactRM(t.available), tone: t.available < 0n ? "err" : "brand", href },
      { label: "Used", value: t.utilisation == null ? "No allocation" : percent(t.utilisation), hint: f.threshold == null ? "Threshold not set" : `Warning at ${percent(f.threshold)}`, tone: f.used === "AT_OR_OVER" ? "warn" : "neutral", href },
      { label: "Codes at or over warning", value: f.codesAtOrOver == null ? null : String(f.codesAtOrOver), hint: f.codesAtOrOver == null ? "Threshold not set" : undefined, href },
    ],
    charts: [
      { title: "By department", body: { kind: "bars", head: "Department", series: ["Spent", "Committed", "Available"], money: true, rows: f.byUnit.map((u) => ({ label: u.label, values: [u.actualSpend, u.committed, u.available] })) } },
      {
        title: "Used through the year",
        body: yearBound(f.through, (p) => ({
          kind: "trend",
          series: ["Spent and committed", "Allocated"],
          // A period that has not started is not drawn (§8); with no zone there is no today, so all are.
          points: p.map((x) => ({ label: x.period.nameEn, value: today != null && storedDay(x.period.startsOn) > today ? null : x.spendPlusCommitments, reference: x.allocated })),
        })),
      },
      { title: "Most used codes", body: { kind: "bars", head: "Budget code", series: ["Used"], money: false, unit: "percent", threshold: f.threshold, rows: f.top.map((c) => ({ label: c.label, values: [c.utilisation] })) } },
    ],
  };
}

function requisitions(f: RequisitionFigures, q: InsightsQuery): TabView {
  // /requisitions has no department or route filter yet (I-6): a narrowed count would not match the list it opens.
  const list = (view: string) => (q.unit || q.route ? undefined : `/requisitions?view=${view}`);
  const d = f.toApproval;
  return {
    tiles: [
      { label: `Raised in ${fyName(f.fy)}`, ...inYear(f.fy, f.raised, String) },
      { label: `Approved in ${fyName(f.fy)}`, ...inYear(f.fy, f.approved, String) },
      { label: "Waiting for approval now", value: String(f.waiting), href: list("pending") },
      { label: "Over budget now", value: String(f.overBudget), href: list("over"), tone: f.overBudget > 0 ? "warn" : "neutral" },
      d?.days != null ? { label: "Median days to approval", value: days(d.days), hint: `Across ${d.across}` } : { label: "Median days to approval", value: null, hint: d ? "None approved yet" : NOT_SET },
    ],
    charts: [
      { title: "Raised and approved by month", body: yearBound(f.months, (m) => ({ kind: "months", money: false, series: ["Raised", "Approved"], months: m.map((x) => ({ month: x.month, values: [x.raised, x.approved] })) })) },
      { title: "By department", body: yearBound(f.byDepartment, (g) => ({ kind: "bars", head: "Department", series: ["Raised"], money: false, rows: countRows(g) })) },
      { title: "By funding route", body: yearBound(f.byRoute, (g) => ({ kind: "bars", head: "Funding route", series: ["Raised"], money: false, rows: countRows(g) })) },
    ],
  };
}

function tenders(f: TenderFigures): TabView {
  return {
    tiles: [
      { label: "Open now", value: String(f.open.total) },
      { label: "Preparing", value: String(f.open.PREPARING) },
      { label: "In market", value: String(f.open.IN_MARKET) },
      { label: "Evaluating", value: String(f.open.EVALUATING) },
      { label: `Awarded in ${fyName(f.fy)}`, ...inYear(f.fy, f.awarded, (a) => formatCompactRM(a.amount), (a) => plural(a.count, "award", "awards")) },
    ],
    charts: [
      { title: "Open by method", body: { kind: "bars", head: "Method", series: ["Preparing", "In market", "Evaluating"], money: false, rows: f.openByMethod.map((g) => ({ label: g.label, values: [g.phases.PREPARING, g.phases.IN_MARKET, g.phases.EVALUATING] })) } },
      { title: "Awarded by month", body: yearBound(f.awardedByMonth, (m) => ({ kind: "months", money: true, series: ["Awarded"], months: m.map((x) => ({ month: x.month, values: [x.amount] })) })) },
      { title: "Awarded by method", body: yearBound(f.awardedByMethod, (g) => ({ kind: "bars", head: "Method", series: ["Awarded"], money: true, rows: amountRows(g) })) },
    ],
  };
}

function projects(f: ProjectFigures, q: InsightsQuery): TabView {
  const view = (s: string) => (q.unit ? undefined : `/projects?view=${s}`);
  const w = f.awaitingPayment;
  return {
    tiles: [
      { label: "Live projects now", value: String(f.live) },
      { label: "On site now", value: String(f.onSite), href: view("on_site") },
      { label: "Contract value on site", value: formatCompactRM(f.onSiteValue), hint: "Original sums; variations are not added", href: view("on_site") },
      { label: `Paid in ${fyName(f.fy)}`, ...inYear(f.fy, f.paid, formatCompactRM) },
      { label: "Waiting for payment now", value: String(w.count), hint: w.oldestDays == null ? undefined : `Oldest ${days(w.oldestDays)}` },
      { label: "Variations open now", value: String(f.variationsOpen.count), hint: formatCompactRM(f.variationsOpen.amount) },
    ],
    charts: [
      { title: "Paid by month", body: yearBound(f.paidByMonth, (m) => ({ kind: "months", money: true, series: ["Paid"], months: m.map((x) => ({ month: x.month, values: [x.amount] })) })) },
      { title: "Projects by stage", body: { kind: "bars", head: "Stage", series: ["Projects"], money: false, rows: f.stages.map((s) => ({ label: CASE_STAGE[s.stage], values: [s.count], href: view(s.stage.toLowerCase()) })) } },
      { title: "Top suppliers by awarded value", body: yearBound(f.topSuppliers, (s) => ({ kind: "bars", head: "Supplier", series: ["Awarded"], money: true, rows: s.map((x) => ({ label: x.label, values: [x.amount], href: x.vendorId ? `/suppliers/${x.vendorId}` : undefined })) })) },
    ],
  };
}

/// `today` is the organisation's day (YYYY-MM-DD), null where no zone is set.
export function dashboardView(f: TabFigures, q: InsightsQuery, today: string | null): TabView {
  switch (f.tab) {
    case "budget":
      return budget(f, q, today);
    case "requisitions":
      return requisitions(f, q);
    case "tenders":
      return tenders(f);
    case "projects":
      return projects(f, q);
    default:
      return overview(f, q);
  }
}
