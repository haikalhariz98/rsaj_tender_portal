import { requireStaff } from "@/app/_auth/actor";
import { CalendarIcon, ChartIcon } from "@/components/icons";
import { Tabs, type TabSpec } from "@/components/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { ENGLISH } from "@/lib/i18n/language";
import { formatOrgDay } from "@/lib/format";
import { insightsContext, loadInsightsTab } from "@/lib/insights/store";
import { parseInsightsQuery, tabFilter, type InsightsTab } from "@/lib/insights/query";
import { organisationTimeZone } from "@/lib/org-time";

import { Filters, Panel, type Choice } from "./panel";
import { dashboardView } from "./view";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const TABS: { id: InsightsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "budget", label: "Budget" },
  { id: "requisitions", label: "Requisitions" },
  { id: "tenders", label: "Tenders & quotations" },
  { id: "projects", label: "Projects & payments" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireStaff();
  const now = new Date();
  const [sp, ctx, timeZone] = await Promise.all([searchParams, insightsContext(db, actor, now), organisationTimeZone(actor.organisationId)]);
  const q = parseInsightsQuery(sp, ctx.choices);
  // Figures only leave this point: the context holds hidden exercise ids and stays on the server.
  const figures = await loadInsightsTab(db, ctx, q);
  const view = dashboardView(figures, q, ctx.today);

  const labelled = (codes: readonly string[], labels: Map<string, string>): Choice[] => codes.map((c) => ({ value: c, label: labels.get(c) ?? c })).sort((a, b) => a.label.localeCompare(b.label));
  const kind = tabFilter(q.tab);
  const extra =
    kind === "route"
      ? { name: "route" as const, label: "Funding route", all: "All funding routes", choices: labelled(ctx.choices.routes, ctx.labels.routes), value: q.route }
      : kind === "method"
        ? { name: "method" as const, label: "Method", all: "All methods", choices: labelled(ctx.choices.methods, ctx.labels.methods), value: q.method }
        : null;
  const keep = Object.fromEntries(
    Object.entries({ year: q.year == null ? null : String(q.year), unit: q.unit, route: q.route, method: q.method }).filter((e): e is [string, string] => e[1] != null),
  );
  const panel = <Panel view={view} q={q} canSetYear={ctx.budget} />;
  const tabs: TabSpec[] = TABS.filter((t) => t.id !== "budget" || ctx.budget).map((t) => ({ ...t, panel: t.id === q.tab ? panel : null, lazy: true }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        info={{ title: "Dashboard", text: "Figures across the organisation. Open a figure to see its records." }}
        meta={[
          <>
            <ChartIcon size={14} />
            {figures.fy.state === "SET" ? `FY ${figures.fy.year}` : "Financial year not set"}
          </>,
          <>
            <CalendarIcon size={14} />
            As at {formatOrgDay(now, timeZone, ENGLISH)}
            {timeZone ? "" : " (UTC: time zone not set)"}
          </>,
        ]}
      />
      <Filters q={q} years={ctx.choices.years.map((y) => ({ value: String(y), label: `FY ${y}` }))} units={labelled(ctx.choices.units, ctx.labels.units)} extra={extra} />
      <Tabs tabs={tabs} initial={q.tab} keep={keep} label="Dashboard" />
    </>
  );
}
