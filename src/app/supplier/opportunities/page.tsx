import { DataList, type Row } from "@/components/data-list";
import { GlobeIcon, BuildingIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import {
  HOME_LINKS,
  METHOD_NOT_STATED,
  NOT_SET_UP,
  OPEN_ROW_ACTION,
  OPPORTUNITIES_ALL_SUBTITLE,
  OPPORTUNITIES_ALL_TITLE,
  OPPORTUNITIES_INFO,
  OPPORTUNITIES_SEARCH,
  OPPORTUNITIES_TITLE,
  OPPORTUNITY_COLUMNS,
  OPPORTUNITY_STATE,
  OPPORTUNITY_VIEWS,
  PORTAL_PATH,
  opportunitiesSubtitle,
  openCount,
} from "@/lib/portal/labels";
import type { OpportunityState } from "@/lib/portal/public";
import { loadOpportunities } from "@/lib/portal/repo";
import { loadPublicShell } from "@/lib/portal/deployment";
import { loadPortalFacts } from "@/lib/portal/public-facts";

export const dynamic = "force-dynamic";

/// Open first, soonest closing at the top; then the closed, most recent first; then the cancelled.
const GROUP: Record<OpportunityState, number> = { OPEN: 0, CLOSED: 1, CANCELLED: 2, AWARDED: 3 };

/**
 * The public board of advertised opportunities. No sign-in. Everything on it passed the public
 * rule (`isPublicOpportunity`) and was reduced to plain strings on the server (`toPublicOpportunity`).
 * An awarded exercise is not listed. Its page stays reachable by its address (My Bids links to it).
 */
export default async function SupplierOpportunitiesPage() {
  const [{ organisation }, { ready, opportunities }, { registerOpen }] = await Promise.all([loadPublicShell(), loadOpportunities(), loadPortalFacts()]);
  const listed = opportunities
    .filter((o) => o.state !== "AWARDED")
    .sort((a, b) => GROUP[a.state] - GROUP[b.state] || (a.state === "OPEN" ? 1 : -1) * (a.closingDay ?? "").localeCompare(b.closingDay ?? ""));
  const open = listed.filter((o) => o.state === "OPEN").length;

  const rows: Row[] = listed.map((o) => ({
    id: o.id,
    views: [o.state === "OPEN" ? "open" : o.state === "CLOSED" ? "closed" : "cancelled"],
    search: [o.title, o.reference, o.method].filter(Boolean).join(" "),
    sortKeys: { closing: o.closingDay ?? "" },
    cells: {
      title: { kind: "link", text: o.title, href: `${PORTAL_PATH.opportunities}/${o.id}`, sub: o.reference },
      method: { kind: "text", text: o.method || METHOD_NOT_STATED.en, dim: !o.method },
      closing: { kind: "text", text: o.closing ?? "—", dim: o.closing == null },
      status: { kind: "badge", text: OPPORTUNITY_STATE[o.state].label.en, tone: OPPORTUNITY_STATE[o.state].tone },
    },
  }));

  return (
    <>
      <PageHeader
        title={OPPORTUNITIES_TITLE.en}
        subtitle={opportunitiesSubtitle(organisation.name).en}
        info={{ title: OPPORTUNITIES_TITLE.en, text: OPPORTUNITIES_INFO.en }}
        meta={ready ? [openCount(open).en] : undefined}
        actions={
          registerOpen ? (
            <ButtonLink href={PORTAL_PATH.register} wholeDocument variant="primary" icon={<BuildingIcon size={16} />}>
              {HOME_LINKS[2].action.en}
            </ButtonLink>
          ) : undefined
        }
      />

      {!ready ? (
        <Card>
          <EmptyState title={NOT_SET_UP.title.en} action={<span className="text-[13.5px] text-ink-2">{NOT_SET_UP.body.en}</span>} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader icon={<GlobeIcon size={17} />} title={OPPORTUNITIES_ALL_TITLE.en} subtitle={OPPORTUNITIES_ALL_SUBTITLE.en} divided={false} />
          <DataList
            flat
            selectable={false}
            exportName="opportunities"
            searchPlaceholder={OPPORTUNITIES_SEARCH.en}
            emptyTitle={OPPORTUNITY_VIEWS.open.emptyTitle.en}
            initialView="open"
            views={(["open", "closed", "cancelled"] as const).map((id) => ({
              id,
              label: OPPORTUNITY_VIEWS[id].label.en,
              emptyTitle: OPPORTUNITY_VIEWS[id].emptyTitle.en,
            }))}
            rowAction={{ label: OPEN_ROW_ACTION.en, hrefTemplate: `${PORTAL_PATH.opportunities}/{id}` }}
            rowOpens
            columns={[
              { key: "title", label: OPPORTUNITY_COLUMNS.opportunity.en, sortable: true, mobile: "primary" },
              { key: "method", label: OPPORTUNITY_COLUMNS.method.en, width: "180px", hideBelow: "lg", mobile: "meta" },
              { key: "closing", label: OPPORTUNITY_COLUMNS.closing.en, width: "190px", nowrap: true, sortable: true, mobile: "meta" },
              { key: "status", label: OPPORTUNITY_COLUMNS.status.en, width: "120px", mobile: "meta" },
            ]}
            rows={rows}
          />
        </Card>
      )}
    </>
  );
}
